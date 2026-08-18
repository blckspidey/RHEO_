/**
 * DropShare — User Controller
 */

'use strict';

const userService = require('../services/userService');
const { HTTP_STATUS } = require('../constants');

async function searchUsers(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(HTTP_STATUS.OK).json({ success: true, data: { users: [] } });
    }
    const users = await userService.searchUsers(q, req.user.userId);
    return res.status(HTTP_STATUS.OK).json({ success: true, data: { users } });
  } catch (err) {
    next(err);
  }
}

async function getUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'User not found' });
    }
    const online = await userService.isUserOnline(id);
    return res.status(HTTP_STATUS.OK).json({ success: true, data: { ...user, online } });
  } catch (err) {
    next(err);
  }
}

async function getLocalUsers(req, res, next) {
  try {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                  req.headers['x-real-ip'] ||
                  req.ip ||
                  req.socket.remoteAddress || '127.0.0.1';
    const cleanIp = rawIp.replace(/^::ffff:/, '');

    const isPrivateOrLoopback =
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp === 'localhost' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp);

    const networkGroup = req.query.networkKey || (isPrivateOrLoopback ? 'local_lan' : cleanIp);

    const users = await userService.getLocalUsers(req.user.userId, networkGroup);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        users,
        networkGroup,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchUsers, getUserStatus, getLocalUsers };
