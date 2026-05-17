// Quick startup probe — runs each plugin step and reports where it hangs
process.env.NODE_ENV = 'development';

import { readFileSync } from 'fs';
import { resolve } from 'path';
import logger from './lib/logger.mjs';

// Load .env manually
const envPath = resolve('d:/Agency/templates/ecom-backend-template/.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  logger.success('.env loaded');
} catch (e) {
  logger.error(`Could not load .env: ${e.message}`);
}

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
logger.info(`Testing Redis URL: ${REDIS_URL}`);

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  commandTimeout: 3000,
  enableOfflineQueue: false,
});

redis.on('error', (e) => logger.error(`Redis error: ${e.message}`));
redis.on('connect', () => logger.success('Redis connected'));
redis.on('ready', () => logger.success('Redis ready'));

try {
  const pong = await redis.ping();
  logger.success(`Redis PING = ${pong}`);

  // Test upsertJobScheduler style — BullMQ does ZADD + HSET on connect
  await redis.zadd('__probe_test__', 1, 'test');
  await redis.del('__probe_test__');
  logger.success('Redis write/delete OK');
} catch (e) {
  logger.error(`Redis command failed: ${e.message}`);
} finally {
  await redis.quit();
}

logger.info('Done — if server still hangs after this, issue is in BullMQ upsertJobScheduler');
