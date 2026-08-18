/**
 * DropShare — In-Memory Transfer State
 *
 * Represents the live state of one active transfer on this server instance.
 * This is separate from the PostgreSQL record which stores durable state.
 *
 * Why two layers?
 *   PostgreSQL: survives server restarts, instance failures, scaling.
 *   In-memory:  fast per-chunk updates without DB overhead.
 *
 * The in-memory state is the "hot path" — updated on every chunk/ACK.
 * PostgreSQL is updated periodically (checkpoint) and on status changes.
 */

'use strict';

const { TRANSFER_STATUS } = require('../constants');

class TransferState {
  /**
   * @param {Object} params
   * @param {string} params.transferId
   * @param {string} params.groupId
   * @param {string} params.senderId
   * @param {string} params.receiverId
   * @param {string} params.fileName
   * @param {number} params.fileSize
   * @param {number} params.totalChunks
   * @param {string} params.fileHash      - SHA-256 hex (may be null initially)
   * @param {number} params.lastConfirmedChunk - Restored from DB on reconnect (-1 if fresh)
   */
  constructor({ transferId, groupId, senderId, receiverId, fileName, fileSize, totalChunks, fileHash, lastConfirmedChunk = -1 }) {
    this.transferId          = transferId;
    this.groupId             = groupId;
    this.senderId            = senderId;
    this.receiverId          = receiverId;
    this.fileName            = fileName;
    this.fileSize            = fileSize;
    this.totalChunks         = totalChunks;
    this.fileHash            = fileHash;

    // Last chunk index that the receiver confirmed (application-level ACK).
    // -1 means no chunks have been confirmed yet.
    // Note: TCP has its own seq/ack mechanism at the transport layer.
    // This is a HIGHER-LEVEL concept: "which application chunks has the
    // receiver processed and written to disk/memory?"
    this.lastConfirmedChunk  = lastConfirmedChunk;

    this.status              = TRANSFER_STATUS.ACCEPTED;
    this.startedAt           = null;
    this.pausedAt            = null;

    // Track how many chunks are currently in-flight (sent but not yet ACK'd).
    // The sender may not exceed MAX_IN_FLIGHT_CHUNKS at any time.
    // This provides application-level backpressure independent of TCP's flow control.
    this.inFlightChunks      = 0;

    // The next chunk index the sender should send
    this.nextChunkToSend     = lastConfirmedChunk + 1;

    // Bytes transferred (for speed/ETA calculation)
    this.bytesTransferred    = 0;
    this.transferStartTime   = null;

    // How many chunks since the last PostgreSQL checkpoint
    this.chunksSinceLastCheckpoint = 0;
  }

  /**
   * Record a chunk ACK from the receiver.
   * Returns true if this chunk creates a new DB checkpoint.
   *
   * @param {number} chunkIndex
   * @param {number} checkpointInterval - from config
   * @returns {boolean} shouldCheckpoint
   */
  acknowledgeChunk(chunkIndex, checkpointInterval) {
    if (chunkIndex > this.lastConfirmedChunk) {
      this.lastConfirmedChunk = chunkIndex;
    }
    this.inFlightChunks = Math.max(0, this.inFlightChunks - 1);
    this.chunksSinceLastCheckpoint++;

    const shouldCheckpoint = this.chunksSinceLastCheckpoint >= checkpointInterval;
    if (shouldCheckpoint) {
      this.chunksSinceLastCheckpoint = 0;
    }
    return shouldCheckpoint;
  }

  markSent(chunkIndex, chunkBytes) {
    this.nextChunkToSend = chunkIndex + 1;
    this.inFlightChunks++;
    this.bytesTransferred += chunkBytes;
    if (!this.transferStartTime) {
      this.transferStartTime = Date.now();
      this.startedAt = new Date();
    }
  }

  get isComplete() {
    return this.lastConfirmedChunk >= this.totalChunks - 1;
  }

  get canSendMore() {
    return this.nextChunkToSend < this.totalChunks;
  }

  get progressPercent() {
    return Math.floor(((this.lastConfirmedChunk + 1) / this.totalChunks) * 100);
  }

  /**
   * Current transfer speed in bytes/second.
   * Returns 0 before any chunks sent.
   */
  get speedBytesPerSecond() {
    if (!this.transferStartTime || this.bytesTransferred === 0) return 0;
    const elapsed = (Date.now() - this.transferStartTime) / 1000;
    return elapsed > 0 ? Math.floor(this.bytesTransferred / elapsed) : 0;
  }

  /**
   * Estimated seconds remaining.
   */
  get etaSeconds() {
    const speed = this.speedBytesPerSecond;
    if (speed === 0) return null;
    const remaining = this.fileSize - this.bytesTransferred;
    return Math.ceil(remaining / speed);
  }

  toJSON() {
    return {
      transferId:         this.transferId,
      status:             this.status,
      lastConfirmedChunk: this.lastConfirmedChunk,
      nextChunkToSend:    this.nextChunkToSend,
      totalChunks:        this.totalChunks,
      progressPercent:    this.progressPercent,
      bytesTransferred:   this.bytesTransferred,
      fileSize:           this.fileSize,
      speedBytesPerSecond: this.speedBytesPerSecond,
      etaSeconds:         this.etaSeconds,
    };
  }
}

module.exports = TransferState;
