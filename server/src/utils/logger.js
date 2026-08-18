/**
 * DropShare — Structured Logger
 *
 * Simple structured logger that outputs JSON in production and
 * readable text in development.
 *
 * NEVER log: passwords, JWT secrets, file contents, private tokens.
 * DO log: userId, transferId, status changes, errors (without secrets).
 */

'use strict';

const config = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = config.IS_PROD ? LEVELS.info : LEVELS.debug;

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  if (config.IS_PROD) {
    // JSON for log aggregators (CloudWatch, Datadog, etc.)
    return JSON.stringify({ timestamp, level: level.toUpperCase(), message, ...meta });
  }
  // Human-readable for local development
  const metaStr = meta && Object.keys(meta).length
    ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
  const reset = '\x1b[0m';
  return `${colors[level] || ''}[${level.toUpperCase()}]${reset} ${timestamp} ${message}${metaStr}`;
}

function log(level, message, meta = {}) {
  if (LEVELS[level] <= CURRENT_LEVEL) {
    const output = formatMessage(level, message, meta);
    if (level === 'error' || level === 'warn') {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}

const logger = {
  error: (msg, meta) => log('error', msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};

module.exports = logger;
