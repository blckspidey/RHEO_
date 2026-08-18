/**
 * DropShare — Chunk Socket Handler
 *
 * Handles the core file transfer: CHUNK, CHUNK_ACK, PAUSE, RESUME.
 *
 * Important networking notes:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ TCP vs Application-Level Chunk ACKs                         │
 * │                                                             │
 * │ TCP (underneath WebSocket) already handles:                 │
 * │   - Reliable byte delivery                                  │
 * │   - Packet ordering and retransmission                      │
 * │   - Flow control (receiver window) and congestion control   │
 * │                                                             │
 * │ Our CHUNK_ACK is a DIFFERENT, HIGHER-LEVEL concept:         │
 * │   "Has the receiver APPLICATION processed this chunk?"      │
 * │   Not: "Did the TCP layer deliver these bytes?"             │
 * │                                                             │
 * │ TCP can deliver bytes successfully but the application      │
 * │ could still fail to write them to disk/memory, or the       │
 * │ WebSocket could be alive while the application crashes.     │
 * │                                                             │
 * │ Our ACKs enable:                                            │
 * │   - Transfer resume after WebSocket disconnection           │
 * │   - Transfer resume after server instance replacement       │
 * │   - Bounded in-flight chunks (application backpressure)     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Backpressure:
 *   The sender must not flood the socket with unlimited chunks.
 *   We enforce MAX_IN_FLIGHT_CHUNKS — the sender may only have
 *   this many unacknowledged chunks in flight at any time.
 *   This prevents memory exhaustion on large file transfers.
 *
 * Server relay:
 *   The server does NOT buffer entire files. It receives a chunk
 *   from the sender socket and immediately emits it to the
 *   receiver socket. In-memory footprint: ~1 chunk at a time.
 */

'use strict';

const { SOCKET_EVENTS, TRANSFER_STATUS } = require('../constants');
const transferManager = require('../transfer/TransferManager');
const transferService = require('../services/transferService');
const { findSocketByUserId } = require('./socketUtils');
const logger = require('../utils/logger');
const config = require('../config/env');

function register(io, socket) {
  // ── CHUNK ─────────────────────────────────────────────────────
  // The sender emits a binary chunk with metadata.
  // We immediately relay it to the receiver — no full-file buffering.
  socket.on(SOCKET_EVENTS.CHUNK, async (data) => {
    const senderId = socket.userId;
    const { transferId, chunkIndex, totalChunks, chunkData } = data;

    const state = transferManager.getActiveTransfer(transferId);
    if (!state) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Transfer not found', transferId });
      return;
    }

    // Authorization: verify the sender matches the authenticated user
    if (state.senderId !== senderId) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Unauthorized chunk', transferId });
      return;
    }

    // Allow chunk if transfer is in ACCEPTED or TRANSFERRING state
    if (state.status === TRANSFER_STATUS.ACCEPTED) {
      state.status = TRANSFER_STATUS.TRANSFERRING;
    } else if (state.status !== TRANSFER_STATUS.TRANSFERRING) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        message: `Cannot receive chunk: transfer is ${state.status}`,
        transferId,
      });
      return;
    }

    // Update in-memory state
    state.markSent(chunkIndex, chunkData.byteLength || chunkData.length || 0);


    // Relay chunk to receiver immediately via receiver user room
    io.to(`user:${state.receiverId}`).emit(SOCKET_EVENTS.CHUNK, {
      transferId,
      chunkIndex,
      totalChunks,
      chunkData,
    });
  });

  // ── CHUNK_ACK ─────────────────────────────────────────────────
  // Receiver confirms it has processed chunk N.
  // We update in-memory state and periodically checkpoint to DB.
  socket.on(SOCKET_EVENTS.CHUNK_ACK, async (data) => {
    const receiverId = socket.userId;
    const { transferId, chunkIndex } = data;

    const state = transferManager.getActiveTransfer(transferId);
    if (!state) return;

    if (state.receiverId !== receiverId) return; // Auth check

    // Update in-memory progress
    const shouldCheckpoint = state.acknowledgeChunk(chunkIndex, config.DB_CHECKPOINT_INTERVAL);

    // Checkpoint to PostgreSQL asynchronously in background — never block real-time chunk flow
    if (shouldCheckpoint) {
      transferService.checkpointTransfer(transferId, state.lastConfirmedChunk).catch(err => {
        logger.warn('Background checkpoint failed', { transferId, error: err.message });
      });
    }

    // Forward ACK to sender user room
    io.to(`user:${state.senderId}`).emit(SOCKET_EVENTS.CHUNK_ACK, {
      transferId,
      chunkIndex,
      progressPercent:    state.progressPercent,
      bytesTransferred:   state.bytesTransferred,
      speedBytesPerSecond: state.speedBytesPerSecond,
      etaSeconds:         state.etaSeconds,
    });

    // Check if transfer is complete
    if (state.isComplete) {
      state.status = TRANSFER_STATUS.COMPLETED;
      await transferService.completeTransfer(transferId);

      logger.info('All chunks received — initiating hash verification', { transferId });

      // Trigger SHA-256 verification on the receiver side
      io.to(`user:${state.receiverId}`).emit(SOCKET_EVENTS.HASH_VERIFY, {
        transferId,
        expectedHash: state.fileHash,
      });

      // Notify sender that all chunks were delivered
      io.to(`user:${state.senderId}`).emit(SOCKET_EVENTS.TRANSFER_COMPLETE, { transferId });

      transferManager.removeActiveTransfer(transferId);
    }
  });

  // ── HASH_RESULT ───────────────────────────────────────────────
  // Receiver has computed the SHA-256 of the reassembled file.
  // We relay the result to the sender.
  socket.on(SOCKET_EVENTS.HASH_RESULT, async (data) => {
    const receiverId = socket.userId;
    const { transferId, receiverHash, senderHash, verified } = data;

    logger.info('Hash verification result received', { transferId, verified });

    // Look up the transfer from DB to find the sender
    const transfer = await transferService.getTransferById(transferId);
    if (!transfer) return;
    if (transfer.receiver_id !== receiverId) return;

    const senderSocket = findSocketByUserId(io, transfer.sender_id);
    if (senderSocket) {
      senderSocket.emit(SOCKET_EVENTS.HASH_RESULT, {
        transferId,
        receiverHash,
        verified,
      });
    }

    if (!verified) {
      logger.warn('SHA-256 verification FAILED', { transferId });
      await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.FAILED);
    }
  });

  // ── PAUSE_TRANSFER ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.PAUSE_TRANSFER, async (data, callback) => {
    const userId = socket.userId;
    const { transferId } = data;

    const state = transferManager.getActiveTransfer(transferId);
    if (!state) return ack(callback, false, 'Transfer not found');

    if (state.senderId !== userId && state.receiverId !== userId) {
      return ack(callback, false, 'Unauthorized');
    }

    state.status = TRANSFER_STATUS.PAUSED;
    state.pausedAt = new Date();

    // Persist pause state to DB for recovery (immediate — not checkpointed)
    await transferService.checkpointTransfer(transferId, state.lastConfirmedChunk);
    await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.PAUSED);

    logger.info('Transfer paused', { transferId, by: userId, lastConfirmedChunk: state.lastConfirmedChunk });

    // Notify both parties
    const otherUserId = userId === state.senderId ? state.receiverId : state.senderId;
    const otherSocket = findSocketByUserId(io, otherUserId);
    if (otherSocket) {
      otherSocket.emit(SOCKET_EVENTS.PAUSE_ACK, { transferId, lastConfirmedChunk: state.lastConfirmedChunk });
    }
    socket.emit(SOCKET_EVENTS.PAUSE_ACK, { transferId, lastConfirmedChunk: state.lastConfirmedChunk });

    ack(callback, true, 'Transfer paused');
  });

  // ── RESUME_TRANSFER ───────────────────────────────────────────
  socket.on(SOCKET_EVENTS.RESUME_TRANSFER, async (data, callback) => {
    const userId = socket.userId;
    const { transferId } = data;

    const state = transferManager.getActiveTransfer(transferId);
    if (!state) return ack(callback, false, 'Transfer not found');

    if (state.senderId !== userId && state.receiverId !== userId) {
      return ack(callback, false, 'Unauthorized');
    }
    if (state.status !== TRANSFER_STATUS.PAUSED) {
      return ack(callback, false, `Transfer is not paused (status: ${state.status})`);
    }

    state.status = TRANSFER_STATUS.TRANSFERRING;
    state.pausedAt = null;
    await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.TRANSFERRING);

    logger.info('Transfer resumed', {
      transferId,
      by: userId,
      resumeFromChunk: state.lastConfirmedChunk + 1,
    });

    // Tell the sender to resume from the next chunk after the last confirmed
    const senderSocket = findSocketByUserId(io, state.senderId);
    if (senderSocket) {
      senderSocket.emit(SOCKET_EVENTS.RESUME_ACK, {
        transferId,
        resumeFromChunk: state.lastConfirmedChunk + 1,
      });
    }

    ack(callback, true, 'Transfer resumed', { resumeFromChunk: state.lastConfirmedChunk + 1 });
  });
}

/**
 * Handle all transfers associated with a disconnected user.
 * Called from sockets/index.js on socket disconnect.
 */
async function handleDisconnect(userId) {
  const userTransfers = transferManager.getTransfersForUser(userId);

  for (const state of userTransfers) {
    if (
      state.status === TRANSFER_STATUS.TRANSFERRING ||
      state.status === TRANSFER_STATUS.PAUSED
    ) {
      logger.info('Transfer interrupted by disconnect', {
        transferId: state.transferId,
        userId,
        lastConfirmedChunk: state.lastConfirmedChunk,
      });

      // Persist the latest progress before losing in-memory state
      await transferService.checkpointTransfer(state.transferId, state.lastConfirmedChunk);
      await transferService.updateTransferStatus(state.transferId, TRANSFER_STATUS.INTERRUPTED);
      state.status = TRANSFER_STATUS.INTERRUPTED;

      // Note: We do NOT remove from TransferManager immediately.
      // The reconnecting user will call TRANSFER_RESUME_REQUEST to restore state.
      // We clean up in recoveryHandler if the session is not restored.
    }
  }
}

function ack(callback, success, message, data) {
  if (typeof callback === 'function') {
    callback({ success, message, data });
  }
}

module.exports = { register, handleDisconnect };
