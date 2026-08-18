/**
 * DropShare — Transfer History Routes
 *
 * GET /api/transfers         - User's transfer history (sent + received)
 * GET /api/transfers/:id     - Single transfer details
 */

'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const transferService = require('../services/transferService');
const { HTTP_STATUS } = require('../constants');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const transfers = await transferService.getUserTransferHistory(req.user.userId);
    res.status(HTTP_STATUS.OK).json({ success: true, data: { transfers } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { authorized, transfer, reason } = await transferService.verifyTransferAuthorization(
      req.params.id, req.user.userId, 'any'
    );
    if (!authorized) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: reason });
    }
    res.status(HTTP_STATUS.OK).json({ success: true, data: { transfer } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
