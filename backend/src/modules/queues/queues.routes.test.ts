import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';

import { registerQueuesRoutes } from './queues.routes';

describe('registerQueuesRoutes', () => {
  it('registers secured admin queue routes', async () => {
    const app = Fastify();
    app.decorateRequest('jwtVerify', async function () {
      (this as unknown as { user: unknown }).user = {
        sub: 'user-1',
        role: 'ADMIN',
        permissions: ['queues:inspect']
      };
    });

    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as never);

    const dummyQueue = {
      name: 'q',
      add: vi.fn(),
      close: vi.fn(),
      getJobCounts: vi.fn().mockResolvedValue({}),
      isPaused: vi.fn().mockResolvedValue(false),
      getActiveCount: vi.fn().mockResolvedValue(0),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getCompletedCount: vi.fn().mockResolvedValue(0),
      getFailedCount: vi.fn().mockResolvedValue(0),
      getDelayedCount: vi.fn().mockResolvedValue(0)
    };
    Object.setPrototypeOf(dummyQueue, Queue.prototype);
    const deadLetterQueue = {
      ...dummyQueue,
      getWaiting: vi.fn().mockResolvedValue([]),
      getCompleted: vi.fn().mockResolvedValue([])
    };
    Object.setPrototypeOf(deadLetterQueue, Queue.prototype);

    app.decorate('queues', {
      orderProcessing: dummyQueue,
      notifications: dummyQueue,
      shipping: dummyQueue,
      inventoryAlerts: dummyQueue,
      refunds: dummyQueue,
      analytics: dummyQueue,
      cartCleanup: dummyQueue,
      outboxDispatch: dummyQueue,
      reconciliation: dummyQueue,
      deadLetter: deadLetterQueue
    } as never);

    await registerQueuesRoutes(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/queues/dlq/summary',
      headers: { authorization: 'Bearer token' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ total: 0, bySourceQueue: {} });

    await app.close();
  });
});

