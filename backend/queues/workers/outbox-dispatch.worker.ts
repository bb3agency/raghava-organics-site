import { Worker, type ConnectionOptions } from 'bullmq';
import { PrismaClient as RealPrismaClient } from '@prisma/client';
import { createQueueRegistry } from '@queues/queue-registry';
import { recordOutboxDeadLetterDepth, recordOutboxLag, recordQueueDeadLetterGrowth } from '@common/observability/metrics';

const MAX_OUTBOX_ATTEMPTS = 5;

type OutboxDispatchWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  createQueueRegistry?: typeof createQueueRegistry;
};

export function createOutboxDispatchWorker(
  connection: ConnectionOptions,
  deps?: OutboxDispatchWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const createRegistry = deps?.createQueueRegistry ?? createQueueRegistry;
  const prisma = new PrismaClientCtor();

  return new WorkerCtor(
    'outbox-dispatch',
    async (job) => {
      if (job.name === 'replay-dead-letter') {
        const replayId = typeof job.data?.outboxMessageId === 'string' ? job.data.outboxMessageId : null;
        const requestedBy = typeof job.data?.requestedBy === 'string' ? job.data.requestedBy : 'unknown';
        if (!replayId) {
          return;
        }
        await prisma.outboxMessage.updateMany({
          where: { id: replayId, status: 'FAILED' },
          data: {
            status: 'PENDING',
            lastError: `Replay requested by ${requestedBy} at ${new Date().toISOString()}`
          }
        });
        return;
      }
      if (job.name !== 'publish-pending') return;

      const registry = createRegistry(connection);
      try {
        const pending = await prisma.outboxMessage.findMany({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: 50
        });
        const oldestPending = pending[0];
        const deadLetterCount = await prisma.outboxMessage.count({
          where: { status: 'FAILED' }
        });
        recordOutboxDeadLetterDepth(deadLetterCount);
        if (oldestPending) {
          recordOutboxLag((Date.now() - oldestPending.createdAt.getTime()) / 1000);
        } else {
          recordOutboxLag(0);
        }

        for (const item of pending) {
          try {
            const claimResult = await prisma.outboxMessage.updateMany({
              where: {
                id: item.id,
                status: 'PENDING'
              },
              data: {
                attemptCount: {
                  increment: 1
                }
              }
            });
            if (claimResult.count === 0) {
              continue;
            }

            const queue = registry[item.queueName as keyof ReturnType<typeof createQueueRegistry>];
            if (!queue) {
              await prisma.outboxMessage.update({
                where: { id: item.id },
                data: {
                  status: 'FAILED',
                  lastError: `Unknown queue: ${item.queueName}`
                }
              });
              recordQueueDeadLetterGrowth('outbox-dispatch', item.jobName);
              continue;
            }

            await queue.add(item.jobName, item.payload as object, item.jobId ? { jobId: item.jobId } : undefined);
            await prisma.outboxMessage.update({
              where: { id: item.id },
              data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                lastError: null
              }
            });
          } catch (error) {
            const nextStatus = item.attemptCount + 1 >= MAX_OUTBOX_ATTEMPTS ? 'FAILED' : 'PENDING';
            await prisma.outboxMessage.update({
              where: { id: item.id },
              data: {
                status: nextStatus,
                lastError: error instanceof Error ? error.message : 'Unknown outbox dispatch error'
              }
            });
            if (nextStatus === 'FAILED') {
              recordQueueDeadLetterGrowth('outbox-dispatch', item.jobName);
            }
          }
        }
      } finally {
        await Promise.allSettled(Object.values(registry).map(async (queue) => queue.close()));
      }
    },
    { connection }
  );
}
