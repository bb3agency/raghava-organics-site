import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsWorker } from './analytics.worker';

type AnalyticsWorkerDeps = NonNullable<Parameters<typeof createAnalyticsWorker>[1]>;
type AnalyticsWorkerType = NonNullable<AnalyticsWorkerDeps['Worker']>;
type AnalyticsPrismaType = NonNullable<AnalyticsWorkerDeps['PrismaClient']>;

describe('analytics worker', () => {
  let processor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
  const create = vi.fn();

  function MockWorker(_name: string, proc: (job: { name: string; data: unknown }) => Promise<void>) {
    processor = proc;
  }

  function MockPrismaClient() {
    return { analyticsEvent: { create } };
  }

  const workerDeps = {
    Worker: MockWorker as unknown as AnalyticsWorkerType,
    PrismaClient: MockPrismaClient as unknown as AnalyticsPrismaType
  };

  beforeEach(() => {
    processor = undefined;
    create.mockReset();
  });

  it('creates analytics event for record-event job', async () => {
    createAnalyticsWorker({}, workerDeps);
    create.mockResolvedValue(undefined);

    await processor?.({
      name: 'record-event',
      data: {
        eventType: 'ADD_TO_CART',
        sessionId: 'sess_1',
        userId: 'user_1',
        payload: {
          productId: 'prod_1',
          quantity: 1
        },
        occurredAt: '2026-04-26T12:00:00.000Z'
      }
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'ADD_TO_CART',
          sessionId: 'sess_1',
          userId: 'user_1',
          payload: expect.objectContaining({
            productId: 'prod_1'
          })
        })
      })
    );
  });

  it('ignores unknown analytics jobs', async () => {
    createAnalyticsWorker({}, workerDeps);

    await processor?.({
      name: 'unknown-job',
      data: {}
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('throws for invalid event type', async () => {
    createAnalyticsWorker({}, workerDeps);

    await expect(
      processor?.({
        name: 'record-event',
        data: {
          eventType: 'INVALID_EVENT',
          sessionId: 'sess_1',
          payload: {}
        }
      })
    ).rejects.toThrow('Invalid analytics event type');
  });
});

