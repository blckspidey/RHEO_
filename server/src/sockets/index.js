/**
 * DropShare — Socket.IO Server
 *
 * Architecture overview:
 *
 *   Browser (React + socket.io-client)
 *       │
 *       │ HTTP GET /socket.io/... (initial handshake)
 *       │ 101 Switching Protocols
 *       │ ─────────────────────────────────────────────
 *       │ WebSocket (persistent bidirectional TCP connection)
 *       │
 *   Nginx (WebSocket upgrade headers forwarded)
 *       │
 *   Socket.IO on Node.js
 *
 * WebSocket sits on top of TCP. TCP handles:
 *   - Reliable byte delivery
 *   - Packet ordering
 *   - Retransmission of lost TCP segments
 *   - Flow control + congestion control
 *
 * Our application adds on top:
 *   - Transfer IDs (identify which transfer a chunk belongs to)
 *   - Application-level ACKs (did the receiver process this chunk?)
 *   - Transfer state machine (PENDING → TRANSFERRING → COMPLETED)
 *   - Resume after disconnection (from last PostgreSQL checkpoint)
 *
 * Multi-instance coordination:
 *   Client A on EC2-1 sends to Client B on EC2-2.
 *   EC2-1 publishes via Redis Pub/Sub.
 *   EC2-2 receives and emits to Client B's socket.
 */

'use strict';

const { Server } = require('socket.io');
const { verifyToken } = require('../services/authService');
const { setUserOnline, setUserOffline } = require('../redis/presence');
const { presence, transferEvents } = require('../redis/pubsub');
const { SOCKET_EVENTS } = require('../constants');
const { updateLastSeen } = require('../services/userService');
const logger = require('../utils/logger');
const config = require('../config/env');

const presenceHandler = require('./presenceHandler');
const transferHandler = require('./transferHandler');
const chunkHandler    = require('./chunkHandler');
const recoveryHandler = require('./recoveryHandler');
const roomHandler     = require('./roomHandler');

/**
 * Initialize Socket.IO on the HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === config.CLIENT_URL) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },

    // Allow larger payloads for binary chunk data.
    // Each chunk is CHUNK_SIZE_BYTES (default 1 MB) + JSON overhead.
    maxHttpBufferSize: config.CHUNK_SIZE_BYTES * 2,
    // Prefer WebSocket transport (avoid HTTP long-polling for large transfers)
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Authentication Middleware ─────────────────────────────────
  // Authenticate every Socket.IO connection before it's established.
  // The JWT is sent in the auth object: socket.handshake.auth.token
  // We must derive identity from the token — never trust client-provided userId.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyToken(token);
      // Attach userId to the socket — accessible in all event handlers
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      logger.warn('Socket auth failed', { error: err.message });
      next(new Error('Invalid or expired token'));
    }
  });

function extractNetworkGroup(socket) {
  if (socket.handshake.auth?.networkKey) {
    return socket.handshake.auth.networkKey;
  }
  const rawIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
                socket.handshake.headers['x-real-ip'] ||
                socket.conn?.remoteAddress ||
                socket.handshake.address || '127.0.0.1';
  const cleanIp = rawIp.replace(/^::ffff:/, '');

  // If loopback or private LAN range (Wi-Fi / Mobile Hotspot / Localhost)
  const isPrivateOrLoopback =
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp);

  if (isPrivateOrLoopback) {
    return 'local_lan';
  }

  // Public IP for cloud deployments (devices on same external gateway)
  return cleanIp;
}

  // ── Connection Handler ────────────────────────────────────────
  io.on('connection', async (socket) => {
    const { userId } = socket;
    logger.info('Socket connected', { userId, socketId: socket.id });

    // Extract client network group for local network peer discovery (Hotspot / LAN)
    const networkGroup = extractNetworkGroup(socket);
    socket.networkGroup = networkGroup;

    // Join user room and local network room
    socket.join(`user:${userId}`);
    socket.join(`network:${networkGroup}`);

    const avatarIndex = socket.handshake.auth?.avatarIndex ?? null;
    const avatarId = socket.handshake.auth?.avatarId ?? null;
    socket.avatarIndex = avatarIndex;
    socket.avatarId = avatarId;

    // Mark user online in Redis + broadcast to other instances
    await setUserOnline(userId, socket.id, networkGroup, avatarIndex, avatarId);
    await presence.publish(SOCKET_EVENTS.USER_ONLINE, { userId, networkGroup, avatarIndex, avatarId });

    // Emit to all other connected clients on THIS instance
    socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, { userId });
    socket.to(`network:${networkGroup}`).emit(SOCKET_EVENTS.LOCAL_PEERS_UPDATE, { userId, type: 'joined' });

    // Register event handlers — each handler file owns its domain
    presenceHandler.register(io, socket);
    transferHandler.register(io, socket);
    chunkHandler.register(io, socket);
    recoveryHandler.register(io, socket);
    roomHandler.register(io, socket);

    // ── Disconnect ─────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info('Socket disconnected', { userId, socketId: socket.id, reason });

      await setUserOffline(userId);
      await updateLastSeen(userId);
      await presence.publish(SOCKET_EVENTS.USER_OFFLINE, { userId });
      socket.broadcast.emit(SOCKET_EVENTS.USER_OFFLINE, { userId });
      socket.to(`network:${networkGroup}`).emit(SOCKET_EVENTS.LOCAL_PEERS_UPDATE, { userId, type: 'left' });

      // Mark any active transfers as INTERRUPTED so they can be recovered
      await chunkHandler.handleDisconnect(userId);
    });
  });

  // ── Cross-Instance Event Routing via Redis ────────────────────
  setupRedisEventRouting(io);

  logger.info('Socket.IO initialized');
  return io;
}

/**
 * Subscribe to Redis channels and relay events to locally-connected clients.
 */
function setupRedisEventRouting(io) {
  // Presence events from other instances
  presence.subscribe((eventName, data) => {
    io.emit(eventName, data);
  });

  // Transfer events (request, accept, reject, etc.) from other instances
  transferEvents.subscribe((eventName, data) => {
    const { targetUserId } = data;
    if (!targetUserId) return;

    // Relay event to target user's room on THIS instance
    io.to(`user:${targetUserId}`).emit(eventName, data.payload);
    logger.debug('Cross-instance event relayed', { eventName, targetUserId });
  });
}

const { findSocketByUserId } = require('./socketUtils');

module.exports = { initSocketIO, findSocketByUserId };
