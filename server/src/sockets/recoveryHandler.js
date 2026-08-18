/**
 * DropShare — Connection Recovery Socket Handler
 *
 * Handles transfer recovery after WebSocket reconnection.
 *
 * Scenario:
 *   1. Ganesh is sending to Rahul. Chunk 1200 confirmed.
 *   2. Ganesh's WebSocket disconnects (network issue, browser refresh).
 *   3. Transfer is marked INTERRUPTED in PostgreSQL.
 *   4. Ganesh reconnects (new WebSocket, new socketId).
 *   5. Ganesh re-authenticates (new JWT checked in socket middleware).
 *   6. Ganesh emits TRANSFER_RESUME_REQUEST { transferId }.
 *   7. Server loads PostgreSQL state → lastConfirmedChunk = 1200.
 *   8. Server recreates in-memory TransferState from DB.
 *   9. Server responds: resume from chunk 1201.
 *  10. Ganesh's client continues sending from chunk 1201.
 *
 * Why this works:
 *   PostgreSQL stored the checkpoint. We don't rely on in-memory state
 *   surviving the disconnect — it may have been cleared, or the client
 *   may be reconnecting to a DIFFERENT EC2 instance after an instance failure.
 *
 * What happens if the EC2 instance was replaced by ASG?
 *   The new instance has no in-memory state. But it has PostgreSQL.
 *   This recovery mechanism reconstructs state from PostgreSQL.
 *   This is why we persist last_confirmed_chunk to the DB.
 */

'use strict';

const { SOCKET_EVENTS, TRANSFER_STATUS } = require('../constants');
const transferService = require('../services/transferService');
const transferManager = require('../transfer/TransferManager');
const logger = require('../utils/logger');

function register(io, socket) {
  socket.on(SOCKET_EVENTS.TRANSFER_RESUME_REQUEST, async (data, callback) => {
    const userId = socket.userId;
    const { transferId } = data;

    try {
      // Load the durable transfer state from PostgreSQL
      const transfer = await transferService.getTransferById(transferId);

      if (!transfer) {
        return ack(callback, false, 'Transfer not found');
      }

      // Authorization: only sender or receiver can resume
      const isSender   = transfer.sender_id   === userId;
      const isReceiver = transfer.receiver_id  === userId;
      if (!isSender && !isReceiver) {
        return ack(callback, false, 'Unauthorized');
      }

      // Only interrupted transfers can be resumed this way
      if (transfer.status !== TRANSFER_STATUS.INTERRUPTED) {
        return ack(callback, false, `Transfer cannot be resumed (status: ${transfer.status})`);
      }

      // Restore in-memory state from the persisted checkpoint
      // If a state already exists (same instance, short disconnect), update it
      let state = transferManager.getActiveTransfer(transferId);
      if (!state) {
        state = transferManager.createActiveTransfer({
          transferId,
          groupId:     transfer.group_id,
          senderId:    transfer.sender_id,
          receiverId:  transfer.receiver_id,
          fileName:    transfer.file_name,
          fileSize:    transfer.file_size,
          totalChunks: transfer.total_chunks,
          fileHash:    transfer.file_hash,
          // Restore from the last DB checkpoint
          lastConfirmedChunk: transfer.last_confirmed_chunk,
        });
      }

      // Update status back to TRANSFERRING
      state.status = TRANSFER_STATUS.TRANSFERRING;
      await transferService.updateTransferStatus(transferId, TRANSFER_STATUS.TRANSFERRING);

      const resumeFromChunk = transfer.last_confirmed_chunk + 1;

      logger.info('Transfer resumed after reconnection', {
        transferId,
        userId,
        resumeFromChunk,
        lastConfirmedChunk: transfer.last_confirmed_chunk,
      });

      ack(callback, true, 'Transfer resumed', {
        transferId,
        resumeFromChunk,
        lastConfirmedChunk: transfer.last_confirmed_chunk,
        fileName:    transfer.file_name,
        fileSize:    transfer.file_size,
        totalChunks: transfer.total_chunks,
        fileHash:    transfer.file_hash,
      });
    } catch (err) {
      logger.error('TRANSFER_RESUME_REQUEST error', { userId, transferId, error: err.message });
      ack(callback, false, 'Failed to resume transfer');
    }
  });
}

function ack(callback, success, message, data) {
  if (typeof callback === 'function') {
    callback({ success, message, data });
  }
}

module.exports = { register };
