/**
 * DropShare — Transfer Service (Prisma)
 *
 * All database operations for transfers.
 * Socket handlers call this service — they don't touch Prisma directly.
 *
 * Transfer Model:
 *   TransferGroup: shared file metadata (one per send operation)
 *   Transfer:      one per recipient — independent lifecycle
 *
 * BigInt note:
 *   Prisma maps PostgreSQL BIGINT → JS BigInt.
 *   BigInt cannot be serialized with JSON.stringify() directly.
 *   We convert fileSize to Number() before returning to clients.
 *   Number is safe up to 2^53 - 1 ≈ 9 PB, well beyond our 5 GB limit.
 */

'use strict';

const { prisma }        = require('../config/db');
const { TRANSFER_STATUS } = require('../constants');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Convert a raw Transfer/TransferGroup record to a JSON-safe object.
 * Converts BigInt fileSize → Number.
 */
function serializeTransfer(transfer) {
  if (!transfer) return null;
  return {
    ...transfer,
    group: transfer.group
      ? { ...transfer.group, fileSize: Number(transfer.group.fileSize) }
      : undefined,
    // If fileSize is at top level (on TransferGroup directly)
    fileSize: transfer.fileSize !== undefined ? Number(transfer.fileSize) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────

/**
 * Create a TransferGroup + one Transfer per receiver.
 * Wrapped in a Prisma interactive transaction — all rows created atomically.
 *
 * @param {Object} params
 * @param {string}   params.senderId
 * @param {string}   params.fileName
 * @param {number}   params.fileSize    - bytes
 * @param {number}   params.totalChunks
 * @param {string}   params.fileHash    - SHA-256 hex
 * @param {string[]} params.receiverIds
 * @returns {Promise<{groupId: string, transfers: Array}>}
 */
async function createTransferGroup({ senderId, fileName, fileSize, totalChunks, fileHash, receiverIds, groupId, predefinedTransfers }) {
  const result = await prisma.$transaction(async (tx) => {
    // Create the shared group record
    const group = await tx.transferGroup.create({
      data: {
        ...(groupId ? { id: groupId } : {}),
        senderId,
        fileName,
        fileSize:    BigInt(fileSize),   // store as BigInt in DB
        totalChunks,
        fileHash:    fileHash || null,
      },
    });

    // Create one transfer row per receiver (all inside the same transaction)
    const transfers = await Promise.all(
      (predefinedTransfers || receiverIds.map(receiverId => ({ receiverId }))).map(t =>
        tx.transfer.create({
          data: {
            ...(t.id ? { id: t.id } : {}),
            groupId:             group.id,
            senderId,
            receiverId:          t.receiverId,
            totalChunks,
            status:              TRANSFER_STATUS.PENDING,
            lastConfirmedChunk:  -1,
          },
        })
      )
    );

    return { groupId: group.id, transfers };
  });

  logger.info('Transfer group created', {
    groupId:       result.groupId,
    transferCount: result.transfers.length,
    senderId,
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Status Updates
// ─────────────────────────────────────────────────────────────────

/**
 * Update a transfer's status.
 * @param {string} transferId
 * @param {string} status
 */
async function updateTransferStatus(transferId, status) {
  try {
    const updated = await prisma.transfer.update({
      where: { id: transferId },
      data:  { status },
      select: { id: true, status: true },
    });
    logger.info('Transfer status updated', { transferId, status });
    return updated;
  } catch (err) {
    if (err.code !== 'P2025') {
      logger.warn('updateTransferStatus error', { transferId, error: err.message });
    }
    return null;
  }
}

/**
 * Mark a transfer as completed.
 * @param {string} transferId
 */
async function completeTransfer(transferId) {
  try {
    await prisma.transfer.update({
      where: { id: transferId },
      data: {
        status:      TRANSFER_STATUS.COMPLETED,
        completedAt: new Date(),
      },
    });
    logger.info('Transfer completed', { transferId });
  } catch (err) {
    if (err.code !== 'P2025') {
      logger.warn('completeTransfer error', { transferId, error: err.message });
    }
  }
}

/**
 * Persist last_confirmed_chunk to PostgreSQL.
 * @param {string} transferId
 * @param {number} lastConfirmedChunk
 */
async function checkpointTransfer(transferId, lastConfirmedChunk) {
  try {
    await prisma.transfer.update({
      where: { id: transferId },
      data:  { lastConfirmedChunk },
    });
    logger.debug('Transfer checkpoint saved', { transferId, lastConfirmedChunk });
  } catch (err) {
    if (err.code !== 'P2025') {
      logger.warn('checkpointTransfer error', { transferId, error: err.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

/**
 * Get a single transfer with its group metadata.
 * Returns a flattened, JSON-safe object.
 * @param {string} transferId
 * @returns {Promise<Object|null>}
 */
async function getTransferById(transferId) {
  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      group: {
        select: {
          fileName:    true,
          fileSize:    true,
          totalChunks: true,
          fileHash:    true,
          senderId:    true,
        },
      },
    },
  });

  if (!transfer) return null;

  // Flatten group fields onto the transfer object (matches old SQL JOIN shape)
  return {
    id:                  transfer.id,
    group_id:            transfer.groupId,
    sender_id:           transfer.senderId,
    receiver_id:         transfer.receiverId,
    status:              transfer.status,
    last_confirmed_chunk: transfer.lastConfirmedChunk,
    total_chunks:        transfer.totalChunks,
    created_at:          transfer.createdAt,
    updated_at:          transfer.updatedAt,
    completed_at:        transfer.completedAt,
    // From the group relation
    file_name:           transfer.group.fileName,
    file_size:           Number(transfer.group.fileSize),  // BigInt → Number
    file_hash:           transfer.group.fileHash,
  };
}

/**
 * Get transfer history for a user (sent + received), most recent first.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getUserTransferHistory(userId) {
  const transfers = await prisma.transfer.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    include: {
      group:    { select: { fileName: true, fileSize: true, fileHash: true } },
      sender:   { select: { username: true } },
      receiver: { select: { username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return transfers.map(t => ({
    id:                   t.id,
    status:               t.status,
    last_confirmed_chunk: t.lastConfirmedChunk,
    total_chunks:         t.totalChunks,
    created_at:           t.createdAt,
    updated_at:           t.updatedAt,
    completed_at:         t.completedAt,
    file_name:            t.group.fileName,
    file_size:            Number(t.group.fileSize),
    file_hash:            t.group.fileHash,
    sender_username:      t.sender.username,
    receiver_username:    t.receiver.username,
    direction:            t.senderId === userId ? 'sent' : 'received',
  }));
}

/**
 * Verify that a user is authorized to act on a transfer.
 * @param {string} transferId
 * @param {string} userId
 * @param {'sender'|'receiver'|'any'} role
 * @returns {Promise<{authorized: boolean, transfer: Object|null, reason?: string}>}
 */
async function verifyTransferAuthorization(transferId, userId, role) {
  const transfer = await getTransferById(transferId);
  if (!transfer) {
    return { authorized: false, transfer: null, reason: 'Transfer not found' };
  }

  const isSender   = transfer.sender_id   === userId;
  const isReceiver = transfer.receiver_id === userId;

  if (role === 'sender'   && !isSender)               return { authorized: false, transfer, reason: 'Not the sender' };
  if (role === 'receiver' && !isReceiver)              return { authorized: false, transfer, reason: 'Not the receiver' };
  if (role === 'any'      && !isSender && !isReceiver) return { authorized: false, transfer, reason: 'Not a participant' };

  return { authorized: true, transfer };
}

module.exports = {
  createTransferGroup,
  updateTransferStatus,
  completeTransfer,
  checkpointTransfer,
  getTransferById,
  getUserTransferHistory,
  verifyTransferAuthorization,
};
