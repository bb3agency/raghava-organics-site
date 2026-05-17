import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

function buildFastify(oldestWaitingAgeSeconds: number) {
  const now = Date.now();

  const queue = {
    getJobCounts: vi.fn(async () => ({ waiting: 1, active: 0 })),
    getWaiting: vi.fn(async () => [{ timestamp: now - oldestWaitingAgeSeconds * 1000 }])
  };

  return {
    prisma: {
      $queryRaw: vi.fn(async () => [{ '?column?': 1 }])
    },
    redis: {
      ping: vi.fn(async () => 'PONG')
    },
    hasDecorator: vi.fn((name: string) => name === 'queues'),
    queues: {
      orderProcessing: queue
    }
  };
}

describe('HealthService queue freshness threshold', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to default threshold when env is invalid', async () => {
    vi.stubEnv('HEALTH_QUEUE_STALE_WAITING_SECONDS', 'not-a-number');
    const fastify = buildFastify(301);
    const service = new HealthService(fastify as never);

    const result = await service.checkReadiness();

    expect(result.queues.workerFreshness).toBe('stale');
    expect(result.status).toBe('not_ready');
    expect(result.degradationMode).toBe('queue_stale');
  });

  it('uses configured threshold when env is valid', async () => {
    vi.stubEnv('HEALTH_QUEUE_STALE_WAITING_SECONDS', '900');
    const fastify = buildFastify(301);
    const service = new HealthService(fastify as never);

    const result = await service.checkReadiness();

    expect(result.queues.workerFreshness).toBe('fresh');
    expect(result.status).toBe('ready');
    expect(result.degradationMode).toBe('none');
  });
});
