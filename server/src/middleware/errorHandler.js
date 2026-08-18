/**
 * DropShare — Centralized Error Handler Middleware
 */

'use strict';

const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const config = require('../config/env');

/**
 * Express error handler — must be registered LAST with app.use().
 * All errors thrown or passed to next(err) arrive here.
 */
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    error: err.message,
    path: req.path,
    method: req.method,
  });

  // Don't expose stack traces in production
  const response = {
    success: false,
    message: err.message || 'Internal server error',
  };

  if (!config.IS_PROD && err.stack) {
    response.stack = err.stack;
  }

  res.status(err.statusCode || HTTP_STATUS.INTERNAL_ERROR).json(response);
}

/**
 * Handle 404 routes — must be registered before errorHandler.
 */
function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
}

module.exports = { errorHandler, notFoundHandler };
