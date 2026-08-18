/**
 * RHEO — Room-Based Sharing Socket Handler
 *
 * Manages ephemeral sharing rooms (in-memory only, no DB).
 * Features short 6-digit Room Codes (e.g. 8X3A92), active room discovery,
 * and strict offline cleanup (offline users are completely removed when they disconnect/leave).
 */

'use strict';

const crypto = require('crypto');
const { SOCKET_EVENTS } = require('../constants');
const logger = require('../utils/logger');
const userService = require('../services/userService');

// ── In-Memory Room Store ──────────────────────────────────────────
// Map<roomId, RoomState>
const rooms = new Map();
// Map<roomCode, roomId>
const codeToRoomIdMap = new Map();

function generateRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (codeToRoomIdMap.has(code));
  return code;
}

function createRoomState(roomId, code, name, creatorId, creatorInfo) {
  const members = new Map();
  members.set(creatorId, creatorInfo);
  return {
    roomId,
    code,
    name: name || `Room ${code}`,
    creatorId,
    creatorUsername: creatorInfo.username,
    members,
    createdAt: new Date(),
    chatHistory: [],
    filesShared: [],
  };
}

function serializeRoom(room) {
  return {
    roomId:    room.roomId,
    code:      room.code,
    name:      room.name,
    creatorId: room.creatorId,
    createdAt: room.createdAt,
    members:   Array.from(room.members.entries()).map(([id, info]) => ({ id, ...info })),
    chatHistory: room.chatHistory.slice(-100),
    filesShared: room.filesShared.slice(-100),
  };
}

function getActiveRoomsSummary() {
  const list = [];
  for (const [, room] of rooms) {
    list.push({
      roomId: room.roomId,
      code: room.code,
      name: room.name,
      creatorUsername: room.creatorUsername || 'Host',
      memberCount: room.members.size,
      createdAt: room.createdAt,
    });
  }
  return list;
}

// ── Register Handler ──────────────────────────────────────────────
function register(io, socket) {
  const userId = socket.userId;

  // ── ROOM_GET_ACTIVE_ROOMS ──────────────────────────────────────
  socket.on('ROOM_GET_ACTIVE_ROOMS', (_data, callback) => {
    try {
      ack(callback, true, 'Active rooms fetched', { activeRooms: getActiveRoomsSummary() });
    } catch (err) {
      ack(callback, false, 'Failed to fetch active rooms');
    }
  });

  // ── ROOM_CREATE ───────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_CREATE, async (data, callback) => {
    try {
      const { name } = data || {};
      const user = await userService.getUserById(userId).catch(() => null);
      const creatorInfo = {
        username:  user?.username  || socket.handshake.auth?.username || 'User',
        avatarId:  socket.avatarId || 'fox',
        avatarIndex: socket.avatarIndex ?? 0,
        online: true,
      };

      const roomId = crypto.randomUUID();
      const code   = generateRoomCode();
      const room   = createRoomState(roomId, code, name, userId, creatorInfo);

      rooms.set(roomId, room);
      codeToRoomIdMap.set(code, roomId);

      // Creator joins the Socket.IO room channel
      socket.join(`room:${roomId}`);

      logger.info('Room created', { roomId, code, creatorId: userId, name: room.name });
      ack(callback, true, 'Room created', { room: serializeRoom(room) });
    } catch (err) {
      logger.error('ROOM_CREATE error', { userId, error: err.message });
      ack(callback, false, 'Failed to create room');
    }
  });

  // ── ROOM_JOIN_BY_CODE ──────────────────────────────────────────
  socket.on('ROOM_JOIN_BY_CODE', async (data, callback) => {
    try {
      const { code } = data || {};
      if (!code) return ack(callback, false, 'Room code required');
      const cleanCode = code.trim().toUpperCase();
      const roomId = codeToRoomIdMap.get(cleanCode);

      if (!roomId) return ack(callback, false, 'Invalid room code. Room may have closed.');

      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room no longer exists');

      const user = await userService.getUserById(userId).catch(() => null);
      const memberInfo = {
        username:  user?.username  || socket.handshake.auth?.username || 'User',
        avatarId:  socket.avatarId || 'fox',
        avatarIndex: socket.avatarIndex ?? 0,
        online: true,
      };

      room.members.set(userId, memberInfo);
      socket.join(`room:${roomId}`);

      socket.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_JOINED, {
        roomId,
        userId,
        username: memberInfo.username,
        avatarId: memberInfo.avatarId,
      });

      logger.info('User joined room by code', { roomId, code: cleanCode, userId });
      ack(callback, true, 'Joined room', { room: serializeRoom(room) });
    } catch (err) {
      logger.error('ROOM_JOIN_BY_CODE error', { userId, error: err.message });
      ack(callback, false, 'Failed to join room');
    }
  });

  // ── ROOM_INVITE ───────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_INVITE, async (data, callback) => {
    try {
      const { roomId, userId: inviteeId } = data || {};
      const room = rooms.get(roomId);

      if (!room) return ack(callback, false, 'Room not found');
      if (room.creatorId !== userId) return ack(callback, false, 'Only the creator can invite members');
      if (room.members.has(inviteeId)) return ack(callback, true, 'User already in room');

      const invitee = await userService.getUserById(inviteeId).catch(() => null);
      if (!invitee) return ack(callback, false, 'User not found');

      const memberInfo = {
        username:    invitee.username || 'User',
        avatarId:    null,
        avatarIndex: null,
        online: true,
      };

      room.members.set(inviteeId, memberInfo);

      io.to(`user:${inviteeId}`).emit(SOCKET_EVENTS.ROOM_INVITED, {
        room: serializeRoom(room),
      });

      socket.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_JOINED, {
        roomId,
        userId: inviteeId,
        username: memberInfo.username,
        avatarId: memberInfo.avatarId,
      });

      logger.info('Room member invited', { roomId, inviteeId });
      ack(callback, true, 'User invited', { room: serializeRoom(room) });
    } catch (err) {
      logger.error('ROOM_INVITE error', { userId, error: err.message });
      ack(callback, false, 'Failed to invite user');
    }
  });

  // ── ROOM_JOIN ──────────────────────────────────────────────────
  socket.on('ROOM_JOIN', async (data, callback) => {
    try {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room no longer active');

      const user = await userService.getUserById(userId).catch(() => null);
      const memberInfo = {
        username:  user?.username  || socket.handshake.auth?.username || 'User',
        avatarId:  socket.avatarId || 'fox',
        avatarIndex: socket.avatarIndex ?? 0,
        online: true,
      };

      room.members.set(userId, memberInfo);
      socket.join(`room:${roomId}`);

      socket.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_JOINED, {
        roomId,
        userId,
        username: memberInfo.username,
        avatarId: socket.avatarId || 'fox',
      });

      logger.info('User joined room socket channel', { roomId, userId });
      ack(callback, true, 'Joined room', { room: serializeRoom(room) });
    } catch (err) {
      logger.error('ROOM_JOIN error', { userId, error: err.message });
      ack(callback, false, 'Failed to join room');
    }
  });

  // ── ROOM_REMOVE_MEMBER ────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_REMOVE_MEMBER, async (data, callback) => {
    try {
      const { roomId, userId: targetId } = data || {};
      const room = rooms.get(roomId);

      if (!room) return ack(callback, false, 'Room not found');
      if (room.creatorId !== userId) return ack(callback, false, 'Only the creator can remove members');
      if (targetId === userId) return ack(callback, false, 'Creator cannot remove themselves');
      if (!room.members.has(targetId)) return ack(callback, false, 'User is not in this room');

      room.members.delete(targetId);

      io.to(`user:${targetId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_REMOVED, { roomId });

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_LEFT, {
        roomId, userId: targetId, reason: 'removed',
      });

      logger.info('Room member removed', { roomId, targetId, removedBy: userId });
      ack(callback, true, 'Member removed', { room: serializeRoom(room) });
    } catch (err) {
      logger.error('ROOM_REMOVE_MEMBER error', { userId, error: err.message });
      ack(callback, false, 'Failed to remove member');
    }
  });

  // ── ROOM_LEAVE ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_LEAVE, async (data, callback) => {
    try {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room not found');

      if (room.creatorId === userId) {
        return dismissRoom(io, socket, roomId, callback);
      }

      room.members.delete(userId);
      socket.leave(`room:${roomId}`);

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_LEFT, {
        roomId, userId, reason: 'removed',
      });

      logger.info('User left room', { roomId, userId });
      ack(callback, true, 'Left room');
    } catch (err) {
      logger.error('ROOM_LEAVE error', { userId, error: err.message });
      ack(callback, false, 'Failed to leave room');
    }
  });

  // ── ROOM_DISMISS ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_DISMISS, async (data, callback) => {
    const { roomId } = data || {};
    await dismissRoom(io, socket, roomId, callback);
  });

  // ── ROOM_CHAT ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_CHAT, (data, callback) => {
    try {
      const { roomId, text } = data || {};
      if (!text || !text.trim()) return ack(callback, false, 'Empty message');

      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room not found');
      if (!room.members.has(userId)) return ack(callback, false, 'Not a member of this room');

      const memberInfo = room.members.get(userId) || {};
      const message = {
        id:           crypto.randomUUID(),
        senderId:     userId,
        senderUsername: memberInfo.username || 'User',
        avatarId:     socket.avatarId || memberInfo.avatarId || 'fox',
        text:         text.trim().slice(0, 2000),
        timestamp:    new Date().toISOString(),
        type:         'message',
      };

      room.chatHistory.push(message);
      if (room.chatHistory.length > 200) room.chatHistory.shift();

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, { roomId, message });

      ack(callback, true, 'Message sent');
    } catch (err) {
      logger.error('ROOM_CHAT error', { userId, error: err.message });
      ack(callback, false, 'Failed to send message');
    }
  });

  // ── ROOM_FILE_SHARED ──────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_FILE_SHARED, (data, callback) => {
    try {
      const { roomId, fileName, fileSize, transferId } = data || {};
      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room not found');
      if (!room.members.has(userId)) return ack(callback, false, 'Not a member');

      const memberInfo = room.members.get(userId) || {};
      const fileEntry = {
        id:             crypto.randomUUID(),
        transferId:     transferId || null,
        senderId:       userId,
        senderUsername: memberInfo.username || 'User',
        avatarId:       socket.avatarId || memberInfo.avatarId || 'fox',
        fileName,
        fileSize,
        timestamp:      new Date().toISOString(),
        type:           'file',
      };

      room.filesShared.push(fileEntry);
      if (room.filesShared.length > 200) room.filesShared.shift();

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_FILE_SHARED, { roomId, notice: fileEntry });
      ack(callback, true, 'File registered in room repository');
    } catch (err) {
      logger.error('ROOM_FILE_SHARED error', { userId, error: err.message });
    }
  });

  // ── ROOM_GET_STATE ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_GET_STATE, (data, callback) => {
    try {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room) return ack(callback, false, 'Room not found');
      if (!room.members.has(userId)) return ack(callback, false, 'Not a member');
      ack(callback, true, 'Room state', { room: serializeRoom(room) });
    } catch (err) {
      ack(callback, false, 'Failed to get room state');
    }
  });

  // ── On disconnect: STRICT REMOVAL (offline users cannot stay in rooms) ──────────
  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      if (room.members.has(userId)) {
        room.members.delete(userId);

        // Notify room members that user left
        socket.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_MEMBER_LEFT, {
          roomId, userId, reason: 'removed',
        });

        // If room is empty or creator disconnected, destroy room
        if (room.members.size === 0 || room.creatorId === userId) {
          if (room.code) codeToRoomIdMap.delete(room.code);
          io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_DISMISSED, { roomId });
          rooms.delete(roomId);
          logger.info('Room dismissed on owner disconnect/empty', { roomId });
        }
      }
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────

async function dismissRoom(io, socket, roomId, callback) {
  try {
    const room = rooms.get(roomId);
    if (!room) return ack(callback, false, 'Room not found');

    const userId = socket.userId;
    if (room.creatorId !== userId) return ack(callback, false, 'Only the creator can dismiss the room');

    if (room.code) {
      codeToRoomIdMap.delete(room.code);
    }

    io.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_DISMISSED, { roomId });

    const socketsInRoom = await io.in(`room:${roomId}`).fetchSockets();
    for (const s of socketsInRoom) {
      s.leave(`room:${roomId}`);
    }

    rooms.delete(roomId);
    logger.info('Room dismissed', { roomId, by: userId });
    ack(callback, true, 'Room dismissed');
  } catch (err) {
    logger.error('ROOM_DISMISS error', { error: err.message });
    ack(callback, false, 'Failed to dismiss room');
  }
}

function ack(callback, success, message, data) {
  if (typeof callback === 'function') {
    callback({ success, message, data });
  }
}

module.exports = { register };
