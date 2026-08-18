/**
 * DropShare — HTTP Server Entry Point
 *
 * Creates the HTTP server, attaches Socket.IO, and starts listening.
 * Graceful shutdown on SIGTERM (Docker stop, AWS instance drain).
 */

'use strict';

const http = require('http');
const app  = require('./app');
const { initSocketIO } = require('./sockets');
const { disconnectPrisma } = require('./config/db');
const { closeRedis } = require('./config/redis');
const config = require('./config/env');
const logger = require('./utils/logger');

// Create the HTTP server that Express and Socket.IO share.
// WebSocket connections use the HTTP Upgrade mechanism:
//   Client → HTTP GET /socket.io/...
//   Server → 101 Switching Protocols
//   Connection upgrades from HTTP to persistent WebSocket (over TCP)
const httpServer = http.createServer(app);

// Attach Socket.IO to the HTTP server
const io = initSocketIO(httpServer);

// ── Start Listening ───────────────────────────────────────────────
httpServer.listen(config.PORT, () => {
  logger.info('DropShare server started', {
    port: config.PORT,
    env:  config.NODE_ENV,
  });
});

// ── Graceful Shutdown ─────────────────────────────────────────────
// SIGTERM: sent by Docker on `docker stop` and by AWS when draining
// an instance from the target group before scaling down.
// We close connections gracefully rather than killing them abruptly.
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal} — starting graceful shutdown`);

  // Stop accepting new HTTP connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close all Socket.IO connections
      io.close();

      // Disconnect Prisma (closes the internal pg connection pool)
      await disconnectPrisma();

      // Release Redis connections
      await closeRedis();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: err.message });
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Catch any unhandled promise rejections to prevent silent failures
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message });
  process.exit(1);
});
