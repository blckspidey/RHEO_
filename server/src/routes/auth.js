/**
 * DropShare — Auth Routes
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me       (requires auth)
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

// Rate limit auth endpoints to slow down brute force attacks.
// 10 requests per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login',    authLimiter, validateLogin,    authController.login);
router.post('/guest',    authController.guestLogin);
router.get('/me',        requireAuth,                   authController.getMe);

module.exports = router;
