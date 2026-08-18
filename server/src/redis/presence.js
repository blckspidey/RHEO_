/**
 * DropShare — User Presence Service (Redis-backed)
 *
 * Tracks which users are currently connected via WebSocket.
 *
 * Why Redis instead of in-memory?
 *   With multiple Node.js instances:
 *     EC2-1 knows Ganesh is connected (his socket is here)
 *     EC2-2 knows Rahul is connected (his socket is there)
 *   But EC2-1 doesn't know about Rahul unless we use a shared store.
 *   Redis provides that shared, low-latency presence store.
 *
 * Storage structure:
 *   Key:   presence:<userId>
 *   Value: JSON { socketId, instanceId, connectedAt }
 *   TTL:   set on disconnect, auto-expires stale entries
 */

'use strict';

const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

const PRESENCE_PREFIX = 'presence:';
const NETWORK_PEERS_PREFIX = 'network_peers:';
const PRESENCE_TTL_SECONDS = 30; // Auto-expire stale entries

/**
 * Mark a user as online in Redis with optional network grouping & avatar index.
 * @param {string} userId       - User's UUID
 * @param {string} socketId     - Socket.IO socket ID on this instance
 * @param {string} [networkGroup] - Local subnet/gateway IP identifier
 * @param {number} [avatarIndex] - Selected animal avatar index (0..15)
 * @param {string} [avatarId]    - Selected animal avatar ID (e.g. 'fox')
 */
async function setUserOnline(userId, socketId, networkGroup = 'default', avatarIndex = null, avatarId = null) {
  const key = PRESENCE_PREFIX + userId;
  const value = JSON.stringify({
    socketId,
    networkGroup,
    avatarIndex,
    avatarId,
    instanceId: process.env.INSTANCE_ID || process.pid.toString(),
    connectedAt: Date.now(),
  });
  // No TTL on online — we clear it explicitly on disconnect
  await redisClient.set(key, value);

  // Add to network peers set
  if (networkGroup) {
    await redisClient.sadd(NETWORK_PEERS_PREFIX + networkGroup, userId);
  }

  logger.info('User came online', { userId, socketId, networkGroup, avatarIndex, avatarId });
}

/**
 * Mark a user as offline — remove from Redis.
 * @param {string} userId
 */
async function setUserOffline(userId) {
  const presence = await getUserPresence(userId);
  if (presence?.networkGroup) {
    await redisClient.srem(NETWORK_PEERS_PREFIX + presence.networkGroup, userId);
  }

  const key = PRESENCE_PREFIX + userId;
  await redisClient.del(key);
  logger.info('User went offline', { userId });
}

/**
 * Get all online user IDs on a specific local network group.
 * @param {string} networkGroup
 * @param {string} [excludeUserId]
 * @returns {Promise<string[]>}
 */
async function getLocalNetworkUserIds(networkGroup, excludeUserId) {
  if (!networkGroup) return [];
  const members = await redisClient.smembers(NETWORK_PEERS_PREFIX + networkGroup);
  if (excludeUserId) {
    return members.filter(id => id !== excludeUserId);
  }
  return members;
}

/**
 * Check if a user is currently online.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isUserOnline(userId) {
  const key = PRESENCE_PREFIX + userId;
  const exists = await redisClient.exists(key);
  return exists === 1;
}

/**
 * Get online status for multiple users at once.
 * @param {string[]} userIds
 * @returns {Promise<Object>} Map of { userId: boolean }
 */
async function getBulkPresence(userIds) {
  if (!userIds || userIds.length === 0) return {};

  const pipeline = redisClient.pipeline();
  for (const userId of userIds) {
    pipeline.exists(PRESENCE_PREFIX + userId);
  }
  const results = await pipeline.exec();

  const presence = {};
  userIds.forEach((userId, index) => {
    presence[userId] = results[index][1] === 1;
  });
  return presence;
}

/**
 * Get presence data for a user (includes socketId, instanceId, networkGroup).
 * Returns null if user is offline.
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getUserPresence(userId) {
  const key = PRESENCE_PREFIX + userId;
  const raw = await redisClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  setUserOnline,
  setUserOffline,
  isUserOnline,
  getBulkPresence,
  getUserPresence,
  getLocalNetworkUserIds,
};
