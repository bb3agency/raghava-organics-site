import { Worker, type ConnectionOptions } from 'bullmq';
import { AnalyticsEventType, Prisma, PrismaClient as RealPrismaClient } from '@prisma/client';

type RecordEventJobData = {
  eventType: AnalyticsEventType;
  sessionId: string;
  userId?: string | null;
  payload?: unknown;
  occurredAt?: string;
};

const analyticsEventTypes = new Set<AnalyticsEventType>(Object.values(AnalyticsEventType));

type AnalyticsWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
};

export function createAnalyticsWorker(
  connection: ConnectionOptions,
  deps?: AnalyticsWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const prisma = new PrismaClientCtor();

  return new WorkerCtor(
    'analytics',
    async (job) => {
      if (job.name !== 'record-event') {
        return;
      }

      const data = job.data as RecordEventJobData;
      if (!analyticsEventTypes.has(data.eventType)) {
        throw new Error('Invalid analytics event type');
      }
      if (!data.sessionId || data.sessionId.trim().length === 0) {
        throw new Error('Missing analytics sessionId');
      }

      const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error('Invalid analytics occurredAt timestamp');
      }

      await prisma.analyticsEvent.create({
        data: {
          eventType: data.eventType,
          sessionId: data.sessionId,
          ...(data.userId ? { userId: data.userId } : {}),
          payload: normalizePayload(data.payload),
          occurredAt
        }
      });
    },
    { connection }
  );
}

function normalizePayload(input: unknown): Prisma.InputJsonValue {
  if (input === undefined) {
    return {};
  }
  if (isInputJsonValue(input)) {
    return input;
  }
  return {};
}

function isInputJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isInputJsonValue(item));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value).every((item) => isInputJsonValue(item));
}

