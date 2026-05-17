import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { redisConfig } from '@config/redis.config';

type RedisInstance = InstanceType<typeof Redis>;

type RedisClientLike = {
  status: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  quit(): Promise<unknown>;
};

type RedisCtorLike = (url: string, options: Record<string, unknown>) => RedisClientLike;

type RedisPluginDeps = {
  redisCtor?: RedisCtorLike;
  redisUrl?: string;
  readyTimeoutMs?: number;
};

export async function registerRedisPlugin(fastify: FastifyInstance, deps: RedisPluginDeps = {}): Promise<void> {
  const redisCtor = deps.redisCtor ?? ((url: string, options: Record<string, unknown>) => new Redis(url, options) as unknown as RedisClientLike);
  const redisUrl = deps.redisUrl ?? redisConfig.url;
  const redisReadyTimeoutMs = deps.readyTimeoutMs ?? 20_000;
  const redis = redisCtor(redisUrl, {
    maxRetriesPerRequest: null,
    keepAlive: 5_000,
    connectTimeout: 15_000,
    enableOfflineQueue: true,
    family: 4,                                              // Force IPv4 — avoids IPv6/localhost resolution issues on Windows
    retryStrategy: (times: number) => Math.min(times * 300, 3_000),
    reconnectOnError: () => true,                          // Reconnect on any error including ECONNABORTED
  });

  // Prevent unhandled 'error' events from crashing the process
  redis.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    fastify.log.error({ err: message }, 'Redis client error');
  });

  // Wait for Redis to be ready before proceeding — prevents command timeouts
  // on the first request after a slow container start.
  // Fail fast with a clear boot error if Redis never becomes ready.
  await new Promise<void>((resolve, reject) => {
    if (redis.status === 'ready') {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      redis.off('ready', onReady);
      reject(new Error(`Redis did not become ready within ${redisReadyTimeoutMs}ms`));
    }, redisReadyTimeoutMs);

    const onReady = () => {
      clearTimeout(timeout);
      resolve();
    };

    redis.once('ready', onReady);
    // Do not reject on individual 'error' events — ioredis will retry automatically via retryStrategy.
    // Timeout above prevents hanging forever when Redis is unavailable.
  });

  fastify.decorate('redis', redis as unknown as RedisInstance);

  fastify.addHook('onClose', async (instance) => {
    await instance.redis.quit();
  });
}

