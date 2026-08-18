/**
 * DropShare — Socket Utility Functions
 * Helper module to prevent circular dependencies between sockets/index.js and handlers.
 */

'use strict';

/**
 * Find a connected socket by userId on this server instance.
 * Linear scan of connected sockets.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @returns {import('socket.io').Socket | null}
 */
function findSocketByUserId(io, userId) {
  if (!io || !io.sockets || !io.sockets.sockets) return null;
  for (const [, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

module.exports = { findSocketByUserId };
