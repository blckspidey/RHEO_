/**
 * DropShare — Input Validation Middleware
 *
 * Validates request bodies for REST endpoints.
 * All validation is server-side — never trust client input.
 */

'use strict';

const { HTTP_STATUS, VALIDATION } = require('../constants');
const config = require('../config/env');

// Simple email regex — RFC 5322 simplified
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Alphanumeric + underscores/hyphens only
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function sendValidationError(res, message) {
  return res.status(HTTP_STATUS.UNPROCESSABLE).json({ success: false, message });
}

/**
 * Validate POST /api/auth/register body
 */
function validateRegister(req, res, next) {
  const { username, email, password } = req.body;

  if (!username || typeof username !== 'string') {
    return sendValidationError(res, 'Username is required');
  }
  const trimmedUsername = username.trim();
  if (trimmedUsername.length < VALIDATION.USERNAME_MIN_LENGTH) {
    return sendValidationError(res, `Username must be at least ${VALIDATION.USERNAME_MIN_LENGTH} characters`);
  }
  if (trimmedUsername.length > VALIDATION.USERNAME_MAX_LENGTH) {
    return sendValidationError(res, `Username must be at most ${VALIDATION.USERNAME_MAX_LENGTH} characters`);
  }
  if (!USERNAME_REGEX.test(trimmedUsername)) {
    return sendValidationError(res, 'Username may only contain letters, numbers, underscores, and hyphens');
  }

  if (!email || typeof email !== 'string') {
    return sendValidationError(res, 'Email is required');
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return sendValidationError(res, 'Invalid email address');
  }
  if (email.length > VALIDATION.EMAIL_MAX_LENGTH) {
    return sendValidationError(res, 'Email is too long');
  }

  if (!password || typeof password !== 'string') {
    return sendValidationError(res, 'Password is required');
  }
  if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    return sendValidationError(res, `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`);
  }

  // Normalize
  req.body.username = trimmedUsername;
  req.body.email = email.trim().toLowerCase();
  next();
}

/**
 * Validate POST /api/auth/login body.
 * Accepts { username, password } where 'username' can be a username or email.
 */
function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return sendValidationError(res, 'Username or email is required');
  }
  if (!password || typeof password !== 'string') {
    return sendValidationError(res, 'Password is required');
  }

  req.body.username = username.trim();
  next();
}

/**
 * Validate file transfer metadata.
 * Server-side check before creating a transfer — don't trust client values.
 */
function validateTransferRequest(req, res, next) {
  const { fileName, fileSize, totalChunks, receiverIds } = req.body;

  if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
    return sendValidationError(res, 'File name is required');
  }
  if (fileName.length > VALIDATION.FILENAME_MAX_LENGTH) {
    return sendValidationError(res, 'File name is too long');
  }
  // Prevent path traversal — filename must not contain directory separators
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return sendValidationError(res, 'Invalid file name');
  }

  if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
    return sendValidationError(res, 'File size must be a positive number');
  }
  if (fileSize > config.MAX_FILE_SIZE_BYTES) {
    return sendValidationError(res, `File size exceeds maximum allowed (${config.MAX_FILE_SIZE_BYTES} bytes)`);
  }

  if (!totalChunks || typeof totalChunks !== 'number' || totalChunks <= 0 || !Number.isInteger(totalChunks)) {
    return sendValidationError(res, 'Invalid total chunks');
  }

  if (!Array.isArray(receiverIds) || receiverIds.length === 0) {
    return sendValidationError(res, 'At least one receiver is required');
  }
  if (receiverIds.length > 50) {
    return sendValidationError(res, 'Too many receivers');
  }
  // UUIDs only
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of receiverIds) {
    if (typeof id !== 'string' || !uuidRegex.test(id)) {
      return sendValidationError(res, 'Invalid receiver ID format');
    }
  }

  next();
}

module.exports = { validateRegister, validateLogin, validateTransferRequest };
