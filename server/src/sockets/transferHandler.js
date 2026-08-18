/**
 * DropShare — Transfer Socket Handler
 *
 * Handles: transfer request, accept, reject, cancel.
 * Chunk transfer is handled in chunkHandler.js.
 *
 * Flow:
 *   Sender emits TRANSFER_REQUEST
 *     → Server validates, creates DB records
 *     → Server routes request to receiver (cross-instance via Redis if needed)
 *   Receiver emits TRANSFER_ACCEPT
 *     → Server marks transfer ACCEPTED
 *     → Server emits TRANSFER_START to sender
 *   Sender begins sending CHUNKs (see chunkHandler.js)
 */

'use strict';

const { SOCKET_EVENTS, TRANSFER_STATUS } = require('../constants');
const transferService = require('../services/transferService');
const userService     = require('../services/userService');
const transferManager = require('../transfer/TransferManager');
const { isUserOnline, getUserPresence } = require('../redis/presence');
const { transferEvents } = require('../redis/pubsub');
const { findSocketByUserId } = require('./socketUtils');
const logger = require('../utils/logger');
const config = require('../config/env');

function register(io, socket) {
  // ── TRANSFER_REQUEST ──────────────────────────────────────────
  socket.on(SOCKET_EVENTS.TRANSFER_REQUEST, async (data, callback) => {
    const senderId = socket.userId; // Derived from JWT — never trust data.senderId

    try {
      const { fileName, fileSize, fileHash, fileType, totalChunks, receiverIds } = data;

      // Basic validation
      if (!Array.isArray(receiverIds) || receiverIds.length === 0) {
        return ack(callback, false, 'No receivers specified');
      }
      if (fileSize > config.MAX_FILE_SIZE_BYTES) {
        return ack(callback, false, 'File exceeds maximum allowed size');
      }
      const crypto = require('crypto');
      const groupId = crypto.randomUUID();
      const transfers = receiverIds.map(receiverId => ({
        id: crypto.randomUUID(),
        groupId,
        senderId,
        receiverId,
        fileName,
        fileSize,
        fileType,
        totalChunks,
        fileHash: fileHash || '',
        status: TRANSFER_STATUS.PENDING,
      }));

      // Register in-memory instantly (< 1ms)
      for (const t of transfers) {
        transferManager.registerPendingTransfer(t);
      }

      const senderUsername = socket.username || socket.handshake.auth?.username || 'Sender';

      // Route the request to each receiver immediately
      for (const transfer of transfers) {
        const receiverId = transfer.receiverId;
        const requestPayload = {
          transferId:  transfer.id,
          groupId,
          senderId,
          senderUsername,
          fileName,
          fileSize,
          fileType,
          totalChunks,
          fileHash: transfer.fileHash,
        };

        routeEventToUser(io, receiverId, SOCKET_EVENTS.TRANSFER_REQUEST, requestPayload);
      }

      // Respond to sender immediately without waiting for database I/O
      ack(callback, true, 'Transfer request sent', { groupId, transfers });

      // Persist in database asynchronously in background with matching UUIDs
      transferService.createTransferGroup({
        senderId,
        fileName,
        fileSize,
        totalChunks,
        fileHash,
        receiverIds,
        groupId,
        predefinedTransfers: transfers,
      }).catch(err => {
        logger.warn('Background transfer create failed', { error: err.message });
      });
    } catch (err) {
      logger.error('TRANSFER_REQUEST error', { senderId, error: err.message });
      ack(callback, false, 'Failed to create transfer request');
    }
  });

  // ── TRANSFER_ACCEPT ───────────────────────────────────────────
  socket.on(SOCKET_EVENTS.TRANSFER_ACCEPT, async (data, callback) => {
    const receiverId = socket.userId;
    const { transferId } = data;

    try {
      const pending = transferManager.getPendingTransfer(transferId);
      let senderId, fileName, fileSize, totalChunks, fileHash, groupId;

      if (pending) {
        if (pending.receiverId !== receiverId) {
          return ack(callback, false, 'Unauthorized');
        }
        senderId = pending.senderId;
        fileName = pending.fileName;
        fileSize = pending.fileSize;
        totalChunks = pending.totalChunks;
        fileHash = pending.fileHash;
        groupId = pending.groupId;
        transferManager.removePendingTransfer(transferId);
      } else {
        // Fallback to database lookup if not found in memory
        const { authorized, transfer, reason } = await transferService.verifyTransferAuthorization(
          transferId, receiverId, 'receiver'
        );
        if (!authorized) {
          return ack(callback, false, reason || 'Unauthorized');
        }
        senderId = transfer.sender_id || transfer.senderId;
        fileName = transfer.file_name || transfer.fileName;
        fileSize = transfer.file_size || transfer.fileSize;
        totalChunks = transfer.total_chunks || transfer.totalChunks;
        fileHash = transfer.file_hash || transfer.fileHash;
        groupId = transfer.group_id || transfer.groupId;
      }

      // Register active transfer in-memory instantly (< 1ms)
      const activeTransfer = transferManager.createActiveTransfer({
        transferId,
        groupId,
        senderId,
        receiverId,
        fileName,
        fileSize,
        totalChunks,
        fileHash,
        lastConfirmedChunk: -1,
      });

      if (activeTransfer) {
        activeTransfer.status = TRANSFER_STATUS.TRANSFERRING;
      }

      // Tell sender to start streaming chunks immediately!
      routeEventToUser(io, senderId, SOCKET_EVENTS.TRANSFER_START, {
        transferId,
        receiverId,
        lastConfirmedChunk: -1,
      });

      ack(callback, true, 'Transfer accepted');

      // Update PostgreSQL in background
      transferService.updateTransferStatus(transferId, TRANSFER_STATUS.ACCEPTED).catch(err => {
        logger.warn('Background transfer accept status update error', { error: err.message });
      });
    } catch (err) {
      logger.error('TRANSFER_ACCEPT error', { receiverId, transferId, error: err.message });
      ack(callback, false, 'Failed to accept transfer');
    }
  });


  // ── TRANSFER_REJECT ───────────────────────────────────────────
  socket.on(SOCKET_EVENTS.TRANSFER_REJECT, async (data, callback) => {
    const receiverId = socket.userId;
    const { transferId } = data;

    try {
      const { authorized, transfer, reason } = await transferService.verifyTransferAuthorization(
        transferId, receiverId, 'receiver'
      );
      if (!authorized) return ack(callback, false, reason || 'Unauthorized');

      await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.REJECTED);
      logger.info('Transfer rejected', { transferId, receiverId });

      const senderId = transfer.sender_id || transfer.senderId;
      await routeEventToUser(io, senderId, SOCKET_EVENTS.TRANSFER_REJECT, { transferId, receiverId });
      ack(callback, true, 'Transfer rejected');
    } catch (err) {
      logger.error('TRANSFER_REJECT error', { receiverId, transferId, error: err.message });
      ack(callback, false, 'Failed to reject transfer');
    }
  });

  // ── TRANSFER_CANCEL ───────────────────────────────────────────
  socket.on(SOCKET_EVENTS.TRANSFER_CANCEL, async (data, callback) => {
    const userId = socket.userId;
    const { transferId } = data;

    try {
      const { authorized, transfer, reason } = await transferService.verifyTransferAuthorization(
        transferId, userId, 'any'
      );
      if (!authorized) return ack(callback, false, reason || 'Unauthorized');

      await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.CANCELLED);
      transferManager.removeActiveTransfer(transferId);
      logger.info('Transfer cancelled', { transferId, cancelledBy: userId });

      // Notify the other party
      const senderId   = transfer.sender_id || transfer.senderId;
      const receiverId = transfer.receiver_id || transfer.receiverId;
      const otherUserId = userId === senderId ? receiverId : senderId;
      await routeEventToUser(io, otherUserId, SOCKET_EVENTS.TRANSFER_CANCEL_ACK, {
        transferId,
        cancelledBy: userId,
      });

      ack(callback, true, 'Transfer cancelled');
    } catch (err) {
      logger.error('TRANSFER_CANCEL error', { userId, transferId, error: err.message });
      ack(callback, false, 'Failed to cancel transfer');
    }
  });

  // ── WEBRTC_SIGNAL (Zero-Data P2P Local LAN Signaling) ──────────
  socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, async (data, callback) => {
    const senderId = socket.userId;
    const { transferId, targetUserId, signal } = data;

    if (!targetUserId || !signal) {
      return ack(callback, false, 'Invalid WebRTC signal payload');
    }

    try {
      logger.debug('Relaying WebRTC P2P signal', { transferId, from: senderId, to: targetUserId, signalType: signal.type });
      await routeEventToUser(io, targetUserId, SOCKET_EVENTS.WEBRTC_SIGNAL, {
        transferId,
        senderId,
        signal,
      });
      ack(callback, true, 'Signal relayed');
    } catch (err) {
      logger.error('WEBRTC_SIGNAL relay error', { senderId, targetUserId, error: err.message });
      ack(callback, false, 'Failed to relay WebRTC signal');
    }
  });

  // ── GET_LOCAL_PEERS (Scan current connected users on local network) ──
  socket.on('GET_LOCAL_PEERS', async (_data, callback) => {
    const userId = socket.userId;
    const networkGroup = socket.networkGroup || 'default';

    try {
      const { getLocalNetworkUserIds } = require('../redis/presence');
      const localUserIds = await getLocalNetworkUserIds(networkGroup, userId);

      if (!localUserIds || localUserIds.length === 0) {
        return ack(callback, true, 'No other local peers found', { peers: [], networkGroup });
      }

      const { getUserPresence } = require('../redis/presence');
      const peers = [];
      for (const id of localUserIds) {
        const u = await userService.getUserById(id);
        const presence = await getUserPresence(id);
        if (u) {
          peers.push({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarIndex: presence?.avatarIndex ?? null,
            avatarId: presence?.avatarId ?? null,
            online: true,
            isLocal: true,
            networkGroup,
          });
        }
      }

      ack(callback, true, 'Local peers found', { peers, networkGroup });
    } catch (err) {
      logger.error('GET_LOCAL_PEERS error', { userId, error: err.message });
      ack(callback, false, 'Failed to retrieve local peers', { peers: [] });
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Route an event to a specific user.
 * If connected locally: emit directly.
 * If on another instance: publish via Redis Pub/Sub.
 */
async function routeEventToUser(io, targetUserId, eventName, payload) {
  if (!targetUserId) {
    logger.warn('routeEventToUser missing targetUserId', { eventName });
    return;
  }

  // Emit directly to target user room (reaches ALL open tabs for this user on local instance)
  io.to(`user:${targetUserId}`).emit(eventName, payload);
  logger.info('Event routed to user room', { targetUserId, eventName });

  // Also publish via Redis Pub/Sub for multi-instance deployments
  try {
    await transferEvents.publish(eventName, {
      targetUserId,
      payload,
    });
  } catch (err) {
    logger.warn('Redis publish failed in routeEventToUser', { error: err.message });
  }
}

function ack(callback, success, message, data) {
  if (typeof callback === 'function') {
    callback({ success, message, data });
  }
}

module.exports = { register, routeEventToUser };
