/**
 * DropShare — User Routes
 *
 * GET /api/users/search?q=rahul
 * GET /api/users/:id/status
 */

'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

// All user routes require authentication
router.use(requireAuth);

router.get('/search',      userController.searchUsers);
router.get('/local',       userController.getLocalUsers);
router.get('/:id/status',  userController.getUserStatus);

module.exports = router;
