/**
 * DropShare — Authentication Service (Prisma)
 *
 * Handles: registration, login, password hashing, JWT signing.
 *
 * Security principles:
 *   - Passwords hashed with bcrypt (cost factor 12)
 *   - JWTs signed with HS256 — contain only userId (no sensitive data)
 *   - Username and email lookups are case-insensitive (Prisma mode: 'insensitive')
 *   - Never return passwordHash to clients
 *   - Prisma unique constraint errors: P2002 (replaces pg error code 23505)
 */

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { prisma }  = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');

const BCRYPT_SALT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.displayName]
 * @returns {Promise<{id, username, email, createdAt}>}
 * @throws {Error} with .code = 'DUPLICATE_USERNAME' | 'DUPLICATE_EMAIL'
 */
async function registerUser({ username, email, password, displayName }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email:       email.toLowerCase(),
        passwordHash,
        displayName: displayName || null,
      },
      select: {
        id:          true,
        username:    true,
        email:       true,
        displayName: true,
        createdAt:   true,
      },
    });

    logger.info('User registered', { userId: user.id, username: user.username });
    return user;
  } catch (err) {
    // Prisma unique constraint violation code
    if (err.constructor.name === 'PrismaClientKnownRequestError' && err.code === 'P2002') {
      const fields = err.meta?.target || [];
      if (fields.includes('username')) {
        const error = new Error('Username already taken');
        error.code = 'DUPLICATE_USERNAME';
        throw error;
      }
      if (fields.includes('email')) {
        const error = new Error('Email already registered');
        error.code = 'DUPLICATE_EMAIL';
        throw error;
      }
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────

/**
 * Authenticate a user with username or email + password.
 * Returns a signed JWT on success.
 * @param {Object} params
 * @param {string} params.username  - username or email accepted
 * @param {string} params.password
 * @returns {Promise<{token: string, user: Object}>}
 * @throws {Error} with .code = 'INVALID_CREDENTIALS'
 */
async function loginUser({ username, password }) {
  // Accept login by username OR email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: 'insensitive' } },
        { email:    { equals: username, mode: 'insensitive' } },
      ],
    },
    select: {
      id:           true,
      username:     true,
      email:        true,
      displayName:  true,
      passwordHash: true,
      lastSeen:     true,
    },
  });

  if (!user) {
    // Generic error — don't reveal whether username/email exists
    const error = new Error('Invalid username or password');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    const error = new Error('Invalid username or password');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  // Update last_seen
  await prisma.user.update({
    where: { id: user.id },
    data:  { lastSeen: new Date() },
  });

  const token = signToken(user.id);
  logger.info('User logged in', { userId: user.id, username: user.username });

  return {
    token,
    user: {
      id:          user.id,
      username:    user.username,
      email:       user.email,
      displayName: user.displayName,
      lastSeen:    user.lastSeen,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Sign a JWT containing only the userId.
 */
function signToken(userId) {
  return jwt.sign({ userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ userId: string }}
 * @throws on invalid/expired token
 */
function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { registerUser, loginUser, signToken, verifyToken };
