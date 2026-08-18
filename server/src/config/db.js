/**
 * DropShare — Prisma Client Singleton
 *
 * Replaces the old pg Pool (config/db.js).
 * All modules that previously did `require('../config/db')` now get
 * the same Prisma client instance through this singleton.
 *
 * Why a singleton?
 *   PrismaClient opens a connection pool internally (via the Rust query
 *   engine). Creating multiple instances in the same process wastes
 *   resources and can exhaust PostgreSQL connections.
 *   NODE_ENV=development guard prevents the hot-reload problem where
 *   nodemon creates a new PrismaClient on every file save.
 *
 * Graceful shutdown:
 *   Call prisma.$disconnect() in server.js graceful shutdown handler.
 *   This replaces the old closePool() from pg.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
} else {
  // In development, reuse the same instance across hot reloads.
  // Store it on the global object to survive nodemon restarts.
  if (!global._prisma) {
    global._prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'query' },
      ],
    });
  }
  prisma = global._prisma;
}

// Forward Prisma logs to our structured logger
prisma.$on('error', (e) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning', { message: e.message });
});

if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    logger.debug('Prisma query', { query: e.query, duration: `${e.duration}ms` });
  });
}

/**
 * Graceful shutdown — call from server.js SIGTERM handler.
 * Replaces closePool() from the old pg config.
 */
async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}

module.exports = { prisma, disconnectPrisma };
