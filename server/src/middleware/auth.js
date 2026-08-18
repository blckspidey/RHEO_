/**
 * DropShare — HTTP Auth Middleware
 *
 * Validates JWT on protected REST endpoints.
 * Attaches req.user = { userId } for downstream handlers.
 *
 * WebSocket auth is handled separately in sockets/index.js
 * (we can't use Express middleware for Socket.IO handshakes).
 */

'use strict';

const { verifyToken } = require('../services/authService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Middleware: require a valid Bearer JWT.
 * Usage: router.get('/protected', requireAuth, handler)
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  try {
    const decoded = verifyToken(token);
    req.user = { userId: decoded.userId };
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}

module.exports = { requireAuth };
