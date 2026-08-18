/**
 * DropShare — Presence Socket Handler
 *
 * Handles presence-related socket events.
 * Most presence logic happens at connection/disconnect in sockets/index.js.
 * This handler provides presence query capability over sockets.
 */

'use strict';

const { getBulkPresence } = require('../redis/presence');
const { SOCKET_EVENTS } = require('../constants');
const logger = require('../utils/logger');

function register(io, socket) {
  /**
   * Client requests online status for a list of user IDs.
   * Used when the dashboard loads to populate the online indicators.
   */
  socket.on('GET_PRESENCE', async ({ userIds }, callback) => {
    try {
      if (!Array.isArray(userIds) || userIds.length > 100) {
        return typeof callback === 'function'
          ? callback({ success: false, message: 'Invalid userIds' })
          : null;
      }
      if (typeof callback === 'function') {
        callback({ success: true, presence });
      }
    } catch (err) {
      logger.error('GET_PRESENCE error', { userId: socket.userId, error: err.message });
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Failed to get presence' });
      }
    }
  });

  // ── UPDATE_AVATAR ───────────────────────────────────────────────
  socket.on('UPDATE_AVATAR', async (data, callback) => {
    try {
      const { avatarIndex, avatarId } = data || {};
      const { setUserOnline } = require('../redis/presence');
      socket.avatarIndex = avatarIndex;
      socket.avatarId = avatarId;
      await setUserOnline(socket.userId, socket.id, socket.networkGroup, avatarIndex, avatarId);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      logger.error('UPDATE_AVATAR error', { userId: socket.userId, error: err.message });
      if (typeof callback === 'function') callback({ success: false });
    }
  });
}

module.exports = { register };
