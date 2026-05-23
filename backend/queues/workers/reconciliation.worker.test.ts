import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReconciliationWorker } from './reconciliation.worker';

type ReconciliationDeps = NonNullable<Parameters<typeof createReconciliationWorker>[1]>;
type ReconciliationWorkerType = NonNullable<ReconciliationDeps['Worker']>;
type ReconciliationPrismaType = NonNullable<ReconciliationDeps['PrismaClient']>;
type ReconciliationQueueType = NonNullable<ReconciliationDeps['Queue']>;

describe('reconciliation worker', () => {
  const originalAutoHealEnv = process.env.RECONCILIATION_AUTO_HEAL_ISSUES;
  let processor: undefined | ((job: { name: string }) => Promise<void>);
  let failedHandler: ((job: unknown, error: Error) => void) | undefined;
  let orders: Array<Record<string, unknown>> = [];
  const issueCreate = vi.fn();
  const issueFindFirst = vi.fn();
  const issueUpdateMany = vi.fn(async () => ({ count: 0 }));
  const orderUpdate = vi.fn(async () => undefined);
  const queueAdd = vi.fn(async () => undefined);
  const queueClose = vi.fn(async () => undefined);

  function MockWorker(_name: string, proc: (job: { name: string }) => Promise<void>) {
    processor = proc;
    return { on: (event: string, handler: (job: unknown, error: Error) => void) => { if (event === 'failed') failedHandler = handler; } };
  }

  function MockPrismaClient() {
    return {
      order: {
        findMany: vi.fn(async () => orders),
        update: orderUpdate
      },
      reconciliationIssue: {
        findFirst: issueFindFirst,
        create: issueCreate,
        updateMany: issueUpdateMany
      }
    };
  }

  function MockQueue(_name: string) {
    return { add: queueAdd, close: queueClose };
  }

  const sendTechnicalFailureAlert = vi.fn().mockResolvedValue(undefined);

  const workerDeps = {
    Worker: MockWorker as unknown as ReconciliationWorkerType,
    PrismaClient: MockPrismaClient as unknown as ReconciliationPrismaType,
    Queue: MockQueue as unknown as ReconciliationQueueType,
    sendTechnicalFailureAlert
  };

  beforeEach(() => {
    processor = undefined;
    failedHandler = undefined;
    sendTechnicalFailureAlert.mockReset();
    process.env.RECONCILIATION_AUTO_HEAL_ISSUES = 'ORDER_SHIPPED_WITHOUT_SHIPMENT,PAYMENT_CAPTURED_ORDER_NOT_CONFIRMED,REFUNDED_STATUS_MISMATCH,STALE_PENDING_PAYMENT';
    orders = [];
    issueCreate.mockReset();
    issueFindFirst.mockReset();
    issueUpdateMany.mockReset();
    orderUpdate.mockReset();
    queueAdd.mockReset();
    queueClose.mockReset();
    issueFindFirst.mockResolvedValue(null);
    issueUpdateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    if (originalAutoHealEnv === undefined) {
      delete process.env.RECONCILIATION_AUTO_HEAL_ISSUES;
      return;
    }
    process.env.RECONCILIATION_AUTO_HEAL_ISSUES = originalAutoHealEnv;
  });

  it('creates classification-enriched issues for mismatches', async () => {
    createReconciliationWorker({} as never, workerDeps);
    orders = [
      {
        id: 'order_1',
        status: 'CONFIRMED',
        createdAt: new Date(),
        payment: { status: 'REFUNDED' },
        shipment: null
      }
    ];

    await processor?.({ name: 'run-order-lifecycle-check' });

    expect(issueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueType: 'ORDER_CONFIRMED_WITHOUT_CAPTURED_PAYMENT',
          details: expect.objectContaining({ severity: 'critical' })
        })
      })
    );
  });

  it('auto-heals captured payment orders stuck in pending payment by enqueuing process-order-update', async () => {
    createReconciliationWorker({} as never, workerDeps);
    orders = [
      {
        id: 'order_auto',
        status: 'PENDING_PAYMENT',
        createdAt: new Date(),
        payment: { status: 'CAPTURED' },
        shipment: null
      }
    ];

    await processor?.({ name: 'run-order-lifecycle-check' });

    expect(queueAdd).toHaveBeenCalledWith(
      'process-order-update',
      expect.objectContaining({
        orderId: 'order_auto',
        toStatus: 'CONFIRMED',
        triggeredBy: 'RECONCILIATION'
      }),
      expect.objectContaining({
        jobId: 'reconcile-process-order-update:order_auto'
      })
    );
    expect(orderUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CONFIRMED' } })
    );
  });

  it('sends terminal failure alert when reconciliation job exhausts all attempts', () => {
    createReconciliationWorker({} as never, workerDeps);

    const terminalJob = { name: 'run-order-lifecycle-check', id: 'job_rec1', opts: { attempts: 2 }, attemptsMade: 2 };
    failedHandler?.(terminalJob, new Error('db scan failed'));

    expect(sendTechnicalFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'reconciliation',
        jobName: 'run-order-lifecycle-check',
        jobId: 'job_rec1',
        terminalFailure: true,
        errorMessage: 'db scan failed'
      })
    );
  });

  it('does NOT send alert when reconciliation job still has remaining attempts', () => {
    createReconciliationWorker({} as never, workerDeps);

    const retryJob = { name: 'run-order-lifecycle-check', id: 'job_rec2', opts: { attempts: 3 }, attemptsMade: 1 };
    failedHandler?.(retryJob, new Error('transient error'));

    expect(sendTechnicalFailureAlert).not.toHaveBeenCalled();
  });

  it('does not auto-heal partially refunded payments to refunded order status', async () => {
    createReconciliationWorker({} as never, workerDeps);
    orders = [
      {
        id: 'order_partial_refund',
        status: 'DELIVERED',
        createdAt: new Date(),
        payment: { status: 'PARTIALLY_REFUNDED' },
        shipment: null
      }
    ];

    await processor?.({ name: 'run-order-lifecycle-check' });

    expect(orderUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_partial_refund' },
        data: { status: 'REFUNDED' }
      })
    );
  });
});
