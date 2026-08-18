/**
 * DropShare — Transfer Manager (In-Memory Registry)
 *
 * Maintains the Map of active transfers on THIS server instance.
 * Each Node.js instance has its own TransferManager.
 *
 * Design decisions:
 *   - Do NOT create a global "currentTransfer" variable.
 *   - Every transfer has a unique transferId.
 *   - Multiple simultaneous transfers are fully independent.
 *   - Cross-instance coordination happens via Redis Pub/Sub, not here.
 *
 * Example concurrent state:
 *   T001: Ganesh → Rahul   (TRANSFERRING, chunk 450/2048)
 *   T002: Ganesh → Amit    (TRANSFERRING, chunk 210/500)
 *   T003: Rahul  → Ganesh  (PAUSED,       chunk 120/300)
 *   T004: Amit   → Priya   (TRANSFERRING, chunk 88/100)
 */

'use strict';

const TransferState = require('./TransferState');
const logger = require('../utils/logger');

class TransferManager {
  constructor() {
    // Map<transferId, TransferState>
    this.activeTransfers = new Map();
    // Map<transferId, pendingTransferData> for sub-millisecond handshakes
    this.pendingTransfers = new Map();
  }

  registerPendingTransfer(data) {
    this.pendingTransfers.set(data.id, data);
  }

  getPendingTransfer(transferId) {
    return this.pendingTransfers.get(transferId) || null;
  }

  removePendingTransfer(transferId) {
    this.pendingTransfers.delete(transferId);
  }

  /**
   * Register a new active transfer on this instance.
   * Called when a transfer is accepted and ready to start.
   *
   * @param {Object} params - Same as TransferState constructor params
   * @returns {TransferState}
   */
  createActiveTransfer(params) {
    if (this.activeTransfers.has(params.transferId)) {
      logger.warn('TransferManager: duplicate transfer registration', { transferId: params.transferId });
      return this.activeTransfers.get(params.transferId);
    }
    const state = new TransferState(params);
    this.activeTransfers.set(params.transferId, state);
    logger.info('TransferManager: transfer registered', { transferId: params.transferId });
    return state;
  }

  /**
   * Retrieve an active transfer's state.
   * Returns null if not found (transfer may be on another instance).
   *
   * @param {string} transferId
   * @returns {TransferState|null}
   */
  getActiveTransfer(transferId) {
    return this.activeTransfers.get(transferId) || null;
  }

  /**
   * Remove a transfer from the in-memory registry.
   * Called on completion, cancellation, or failure.
   * Does NOT delete from PostgreSQL — history is preserved there.
   *
   * @param {string} transferId
   */
  removeActiveTransfer(transferId) {
    const existed = this.activeTransfers.delete(transferId);
    if (existed) {
      logger.info('TransferManager: transfer deregistered', { transferId });
    }
  }

  /**
   * Get all active transfers for a given user (as sender or receiver).
   * @param {string} userId
   * @returns {TransferState[]}
   */
  getTransfersForUser(userId) {
    const result = [];
    for (const state of this.activeTransfers.values()) {
      if (state.senderId === userId || state.receiverId === userId) {
        result.push(state);
      }
    }
    return result;
  }

  /**
   * Get all active transfers where this user is the sender.
   * @param {string} userId
   * @returns {TransferState[]}
   */
  getSentTransfersForUser(userId) {
    const result = [];
    for (const state of this.activeTransfers.values()) {
      if (state.senderId === userId) result.push(state);
    }
    return result;
  }

  /**
   * Current count of active transfers on this instance.
   * Useful for metrics and health checks.
   */
  get activeCount() {
    return this.activeTransfers.size;
  }
}

// Singleton — one TransferManager per Node.js process
const transferManager = new TransferManager();

module.exports = transferManager;
