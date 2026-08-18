/**
 * DropShare — Express Application
 *
 * Configures middleware and routes.
 * HTTP server creation and Socket.IO init happen in server.js.
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const config  = require('./config/env');
const logger  = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes      = require('./routes/auth');
const userRoutes      = require('./routes/users');
const transferRoutes  = require('./routes/transfers');

const app = express();

// ── Security Headers ─────────────────────────────────────────────
// Helmet sets safe default HTTP headers.
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────
// Restrict API access to the React frontend origin.
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl) or any localhost/127.0.0.1
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === config.CLIENT_URL) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// ── Body Parsing ──────────────────────────────────────────────────
// JSON body for REST endpoints. File data travels via WebSocket, not HTTP.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Request Logging ───────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Health Check ─────────────────────────────────────────────────
// AWS ALB health checks use this endpoint. It must respond 200 quickly.
// Do NOT make this dependent on database or socket state.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/transfers', transferRoutes);

// ── 404 + Error Handlers ─────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
