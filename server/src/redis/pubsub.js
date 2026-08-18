/**
 * DropShare — Redis Pub/Sub Service
 *
 * Cross-instance event propagation via Redis.
 *
 * Architecture:
 *   EC2-1 (Sender's socket)                EC2-2 (Receiver's socket)
 *       │                                        ▲
 *       │ publish('transfer_events', event)       │
 *       └──────────────────► Redis ──────────────┘
 *                                  subscribe('transfer_events')
 *
 * This file provides:
 *   publishEvent(channel, eventName, data) — serialize + publish
 *   subscribeToChannel(channel, handler)   — parse + dispatch
 *
 * File data is NEVER published through Redis. Only small JSON
 * control messages (< 1 KB typically) flow through these channels.
 */

'use strict';

const { publisher, subscriber } = require('../config/redis');
const { REDIS_CHANNELS } = require('../constants');
const logger = require('../utils/logger');

const INSTANCE_ID = process.env.INSTANCE_ID || `inst_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

// Track registered handlers per channel
const handlers = new Map();

/**
 * Publish an event to a Redis channel.
 * All subscribers on any Node.js instance will receive it.
 *
 * @param {string} channel   - Redis channel name
 * @param {string} eventName - Application event name (e.g. 'TRANSFER_REQUEST')
 * @param {Object} data      - Event payload (must be JSON-serializable)
 */
async function publishEvent(channel, eventName, data) {
  const message = JSON.stringify({ event: eventName, data, instanceId: INSTANCE_ID, timestamp: Date.now() });
  await publisher.publish(channel, message);
  logger.debug('Redis event published', { channel, event: eventName });
}

/**
 * Subscribe to a Redis channel and register a handler.
 * Multiple handlers can be registered for the same channel.
 *
 * @param {string}   channel - Redis channel name
 * @param {Function} handler - Called with (eventName, data) for each message
 */
async function subscribeToChannel(channel, handler) {
  if (!handlers.has(channel)) {
    handlers.set(channel, []);

    // Subscribe in Redis — ioredis 'message' event fires for all channels
    await subscriber.subscribe(channel);
    logger.info('Redis subscribed to channel', { channel });
  }

  handlers.get(channel).push(handler);
}

// Route incoming Redis messages to the registered handlers
subscriber.on('message', (channel, message) => {
  const channelHandlers = handlers.get(channel);
  if (!channelHandlers || channelHandlers.length === 0) return;

  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (err) {
    logger.error('Failed to parse Redis message', { channel, error: err.message });
    return;
  }

  // Ignore messages published by this exact process instance to prevent duplicates
  if (parsed.instanceId === INSTANCE_ID) return;

  for (const handler of channelHandlers) {
    try {
      handler(parsed.event, parsed.data);
    } catch (err) {
      logger.error('Redis message handler error', { channel, event: parsed.event, error: err.message });
    }
  }
});


// Convenience helpers for the two main channels
const presence = {
  publish: (eventName, data) => publishEvent(REDIS_CHANNELS.PRESENCE, eventName, data),
  subscribe: (handler) => subscribeToChannel(REDIS_CHANNELS.PRESENCE, handler),
};

const transferEvents = {
  publish: (eventName, data) => publishEvent(REDIS_CHANNELS.TRANSFER_EVENTS, eventName, data),
  subscribe: (handler) => subscribeToChannel(REDIS_CHANNELS.TRANSFER_EVENTS, handler),
};

module.exports = { publishEvent, subscribeToChannel, presence, transferEvents };
