/**
 * DropShare — Auth Controller (Prisma)
 * Thin layer: validate → call service → return response.
 * Business logic lives in authService, not here.
 */

'use strict';

const authService = require('../services/authService');
const { prisma }  = require('../config/db');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

async function register(req, res, next) {
  try {
    const { username, email, password, displayName } = req.body;
    const user  = await authService.registerUser({ username, email, password, displayName });
    const token = authService.signToken(user.id);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Account created successfully',
      data:    { token, user },
    });
  } catch (err) {
    if (err.code === 'DUPLICATE_USERNAME') {
      return res.status(HTTP_STATUS.CONFLICT).json({ success: false, message: err.message });
    }
    if (err.code === 'DUPLICATE_EMAIL') {
      return res.status(HTTP_STATUS.CONFLICT).json({ success: false, message: err.message });
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    // Accept { username, password } — authService also matches email
    const { username, password } = req.body;
    const result = await authService.loginUser({ username, password });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Login successful',
      data:    result,
    });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/auth/me — return the authenticated user's profile.
 * Used by the frontend to restore session state on page refresh.
 */
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: {
        id:          true,
        username:    true,
        email:       true,
        displayName: true,
        createdAt:   true,
        lastSeen:    true,
      },
    });

    if (!user) {
      if (req.user.userId.startsWith('guest_')) {
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          data: {
            user: {
              id: req.user.userId,
              username: 'Guest',
              displayName: 'Guest User',
              isGuest: true,
            }
          }
        });
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'User not found' });
    }

    return res.status(HTTP_STATUS.OK).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/guest — initialize temporary guest user for local network sharing.
 */
async function guestLogin(req, res, next) {
  try {
    const crypto = require('crypto');
    const { username } = req.body || {};
    const cleanUsername = (username || 'Guest').trim().slice(0, 30) || 'Guest';
    const guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
    const token = authService.signToken(guestId);

    const user = {
      id: guestId,
      username: cleanUsername,
      displayName: `${cleanUsername} (Guest)`,
      isGuest: true,
    };

    logger.info('Guest user initialized', { guestId, username: cleanUsername });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Guest session created',
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, getMe, guestLogin };
