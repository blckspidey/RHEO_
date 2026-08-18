/**
 * DropShare — Environment Configuration
 *
 * Single source of truth for environment variables.
 * All env access goes through this module — no process.env scattered
 * throughout the codebase.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load server-scoped environment variables from server/.env
const serverEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: serverEnvPath });
// Fallback to process.cwd() if launched differently
dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

const config = {
  // Server
  NODE_ENV:   process.env.NODE_ENV || 'development',
  PORT:       getEnvInt('PORT', 5000),
  IS_PROD:    process.env.NODE_ENV === 'production',

  // Database (PostgreSQL)
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Redis
  REDIS_URL: requireEnv('REDIS_URL'),

  // JWT
  JWT_SECRET:     requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // CORS
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  // Transfer configuration
  //
  // CHUNK_SIZE_BYTES: Application-level chunk size.
  // Smaller = finer progress + lower retry cost per failed chunk.
  // Larger  = fewer messages + better throughput potential.
  // Default: 1 MB
  CHUNK_SIZE_BYTES: getEnvInt('CHUNK_SIZE_BYTES', 1048576),

  // MAX_FILE_SIZE_BYTES: Reject files larger than this at the API level.
  // Default: 5 GB
  MAX_FILE_SIZE_BYTES: getEnvInt('MAX_FILE_SIZE_BYTES', 5368709120),

  // MAX_IN_FLIGHT_CHUNKS: Application-level flow control window.
  // The sender may have at most this many unacknowledged chunks in
  // flight at once. This is NOT TCP's congestion window — TCP manages
  // byte-level flow control internally. This controls application
  // memory pressure and prevents socket buffer overflow.
  // Default: 8 chunks
  MAX_IN_FLIGHT_CHUNKS: getEnvInt('MAX_IN_FLIGHT_CHUNKS', 8),

  // DB_CHECKPOINT_INTERVAL: Persist last_confirmed_chunk to PostgreSQL
  // every N chunks. Writing every single ACK to the DB would cause
  // thousands of writes for a 2 GB file — unnecessary overhead.
  // We checkpoint periodically so recovery is accurate to ±N chunks.
  // Default: every 50 chunks
  DB_CHECKPOINT_INTERVAL: getEnvInt('DB_CHECKPOINT_INTERVAL', 50),
};

module.exports = config;
