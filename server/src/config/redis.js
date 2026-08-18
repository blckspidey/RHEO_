'use strict';

const EventEmitter = require('events');
const logger = require('../utils/logger');

class MockRedis extends EventEmitter {
  constructor() {
    super();
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async set(key, val) {
    this.store.set(key, val);
    return 'OK';
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  async exists(key) {
    return this.store.has(key) ? 1 : 0;
  }

  async sadd(key, member) {
    if (!this.store.has(key)) {
      this.store.set(key, new Set());
    }
    const set = this.store.get(key);
    if (set instanceof Set) {
      set.add(member);
    }
    return 1;
  }

  async srem(key, member) {
    if (this.store.has(key)) {
      const set = this.store.get(key);
      if (set instanceof Set) {
        set.delete(member);
      }
    }
    return 1;
  }

  async smembers(key) {
    if (!this.store.has(key)) return [];
    const val = this.store.get(key);
    if (val instanceof Set) {
      return Array.from(val);
    }
    return [];
  }

  pipeline() {
    const operations = [];
    const chain = {
      exists: (key) => {
        operations.push(async () => [null, this.store.has(key) ? 1 : 0]);
        return chain;
      },
      exec: async () => {
        return Promise.all(operations.map(op => op()));
      }
    };
    return chain;
  }

  async quit() {
    logger.info('Mock Redis quit');
  }

  async subscribe(ch) {
    logger.info(`Mock Redis subscribed to channel`, { channel: ch });
  }

  async publish(ch, msg) {
    logger.debug(`Mock Redis published event`, { channel: ch });
    this.emit('message', ch, msg);
  }
}

const mock = new MockRedis();

module.exports = {
  publisher: mock,
  subscriber: mock,
  redisClient: mock,
  closeRedis: async () => mock.quit(),
};
