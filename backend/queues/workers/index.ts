import dotenv from 'dotenv';
import IORedis, { RedisOptions } from 'ioredis';
import pino from 'pino';
import { Queue } from 'bullmq';
import { validateBootstrapEnv } from '@config/app.config';
import { refreshFeatureFlags } from '@config/feature-flags';
import prismaClient from '../../src/database/prisma.service';
import { applyOpsConfigRuntimeOverlay, type OpsConfigRuntimePrismaLike } from '../../src/modules/ops/ops-config-runtime';
import { dlqJobOptions } from '../queue-registry';
import { createOrderProcessingWorker } from './order-processing.worker';
import { createShippingWorker } from './shipping.worker';
import { createNotificationsWorker } from './notifications.worker';
import { createInventoryAlertsWorker } from './inventory-alerts.worker';
import { createRefundsWorker } from './refunds.worker';
import { createCartCleanupWorker } from './cart-cleanup.worker';
import { createAnalyticsWorker } from './analytics.worker';
import { createOutboxDispatchWorker } from './outbox-dispatch.worker';
import { createReconciliationWorker } from './reconciliation.worker';
import { createDeadLetterWorker } from './dead-letter.worker';
import { attachWorkerLogging } from './worker-logging';

dotenv.config();

function isEnabled(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function requireWorkerEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required worker env var: ${name}`);
  }
  return value;
}

function validateWorkerEnv(): void {
  const env = (process.env.NODE_ENV ?? 'development').toLowerCase();
  const isStrictProfile = env !== 'development' && env !== 'test';
  if (isStrictProfile) {
    requireWorkerEnv('DATABASE_URL');
    requireWorkerEnv('REPLAY_APPROVAL_TOKEN');
    requireWorkerEnv('ADMIN_MFA_ENCRYPTION_KEY');
    requireWorkerEnv('OPS_DB_ENCRYPTION_KEY');
  }
  if (isEnabled(process.env.NOTIFY_EMAIL_ENABLED)) {
    requireWorkerEnv('RESEND_API_KEY');
    requireWorkerEnv('RESEND_FROM');
  }
  if (isEnabled(process.env.NOTIFY_SMS_ENABLED)) {
    const smsProvider = (process.env.SMS_PROVIDER ?? 'msg91').trim().toLowerCase();
    if (smsProvider === 'msg91') {
      requireWorkerEnv('MSG91_AUTH_KEY');
      requireWorkerEnv('MSG91_SENDER_ID');
    } else if (smsProvider === 'fast2sms') {
      requireWorkerEnv('FAST2SMS_API_KEY');
    } else if (smsProvider !== 'noop') {
      throw new Error(`Unsupported SMS_PROVIDER for workers: ${smsProvider}`);
    }
  }
  if (isEnabled(process.env.FEATURE_GST_INVOICING_ENABLED)) {
    requireWorkerEnv('STORE_LEGAL_NAME');
    requireWorkerEnv('STORE_SELLER_ADDRESS');
    requireWorkerEnv('STORE_SELLER_STATE');
    requireWorkerEnv('STORE_SELLER_GSTIN');
  }
  if (isEnabled(process.env.OTEL_TRACING_ENABLED)) {
    requireWorkerEnv('OTEL_EXPORTER_OTLP_ENDPOINT');
  }
  const shippingProvider = (process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase();
  if (shippingProvider === 'delhivery') {
    requireWorkerEnv('DELHIVERY_API_KEY');
    if (isStrictProfile) {
      requireWorkerEnv('DELHIVERY_WEBHOOK_TOKEN');
    }
  } else if (shippingProvider === 'shiprocket') {
    requireWorkerEnv('SHIPROCKET_EMAIL');
    requireWorkerEnv('SHIPROCKET_PASSWORD');
    if (isStrictProfile) {
      requireWorkerEnv('SHIPROCKET_WEBHOOK_TOKEN');
    }
  }
}

async function bootstrapWorkers(): Promise<void> {
  validateBootstrapEnv();
  const overlayReport = await applyOpsConfigRuntimeOverlay(prismaClient as unknown as OpsConfigRuntimePrismaLike);
  refreshFeatureFlags();
  validateWorkerEnv();

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Missing required env var: REDIS_URL');
  }

  const logger = pino();
  logger.info({
    appliedKeys: overlayReport.appliedKeys,
    skippedBootstrapKeys: overlayReport.skippedBootstrapKeys,
    skippedUnknownKeys: overlayReport.skippedUnknownKeys,
    failedKeys: overlayReport.failedKeys
  }, 'Ops DB runtime config overlay applied for workers');

  // --- Redis connection hardening (R2) ---
  // BullMQ requires maxRetriesPerRequest: null — different from the API process.
  // keepAlive, connectTimeout, and retryStrategy prevent silent connection drops.
  const workerRedisOptions: RedisOptions = {
    maxRetriesPerRequest: null,   // BullMQ requirement
    keepAlive: 10_000,            // TCP keepalive every 10s
    connectTimeout: 10_000,       // Fail fast at boot if Redis is unreachable
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
  };

  const redis = new IORedis(redisUrl, workerRedisOptions);
  const workerRedis = redis.duplicate();

  // Error listeners prevent unhandled 'error' events from crashing the worker process
  redis.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker Redis client error (primary)');
  });
  workerRedis.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker Redis client error (worker)');
  });

  const orderProcessingWorker = createOrderProcessingWorker(workerRedis);
  const shippingWorker = createShippingWorker(workerRedis);
  const notificationsWorker = createNotificationsWorker(workerRedis);
  const inventoryAlertsWorker = createInventoryAlertsWorker(workerRedis);
  const refundsWorker = createRefundsWorker(workerRedis);
  const cartCleanupWorker = createCartCleanupWorker(workerRedis);
  const analyticsWorker = createAnalyticsWorker(workerRedis);
  const outboxDispatchWorker = createOutboxDispatchWorker(workerRedis);
  const reconciliationWorker = createReconciliationWorker(workerRedis);
  const deadLetterWorker = createDeadLetterWorker(workerRedis);

  // --- DLQ connection fix (R3) ---
  // Use workerRedis.duplicate() to preserve password, TLS, and db config from the
  // original Redis URL. The previous host/port extraction lost these settings.
  const dlqConnection = workerRedis.duplicate();
  dlqConnection.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker Redis client error (DLQ)');
  });

  const deadLetterQueue = new Queue('dead-letter', {
    connection: dlqConnection,
    defaultJobOptions: dlqJobOptions
  });

  attachWorkerLogging(orderProcessingWorker, logger, deadLetterQueue);
  attachWorkerLogging(shippingWorker, logger, deadLetterQueue);
  attachWorkerLogging(notificationsWorker, logger, deadLetterQueue);
  attachWorkerLogging(inventoryAlertsWorker, logger, deadLetterQueue);
  attachWorkerLogging(refundsWorker, logger, deadLetterQueue);
  attachWorkerLogging(cartCleanupWorker, logger, deadLetterQueue);
  attachWorkerLogging(analyticsWorker, logger, deadLetterQueue);
  attachWorkerLogging(outboxDispatchWorker, logger, deadLetterQueue);
  attachWorkerLogging(reconciliationWorker, logger, deadLetterQueue);
  attachWorkerLogging(deadLetterWorker, logger);

  let shiprocketRefreshQueue: Queue | null = null;
  let shiprocketRefreshConnection: IORedis | null = null;
  if ((process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase() === 'shiprocket') {
    shiprocketRefreshConnection = workerRedis.duplicate();
    shiprocketRefreshConnection.on('error', (err) => {
      logger.error({ err: err.message }, 'Worker Redis client error (Shiprocket refresh queue)');
    });
    shiprocketRefreshQueue = new Queue('shipping', { connection: shiprocketRefreshConnection });
    shiprocketRefreshQueue
      .add(
        'shiprocket-token-refresh',
        {},
        {
          repeat: { every: 9 * 24 * 60 * 60 * 1000 },
          jobId: 'shiprocket-token-refresh-repeatable'
        }
      )
      .catch((err: unknown) => {
        logger.warn({ err }, 'Failed to register shiprocket-token-refresh repeatable job');
      });
  }

  logger.info('All background workers started successfully and are listening for jobs.');

  // --- Shutdown orchestration ---
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    const closeResults = await Promise.allSettled([
      orderProcessingWorker.close(),
      shippingWorker.close(),
      notificationsWorker.close(),
      inventoryAlertsWorker.close(),
      refundsWorker.close(),
      cartCleanupWorker.close(),
      analyticsWorker.close(),
      outboxDispatchWorker.close(),
      reconciliationWorker.close(),
      deadLetterWorker.close(),
      deadLetterQueue.close(),
      ...(shiprocketRefreshQueue ? [shiprocketRefreshQueue.close()] : [])
    ]);
    for (const result of closeResults) {
      if (result.status === 'rejected') {
        logger.error({ err: result.reason }, 'Worker/queue close error during shutdown');
      }
    }
    // Redis quit() must always run regardless of close() failures above
    await Promise.allSettled([
      shiprocketRefreshConnection ? shiprocketRefreshConnection.quit() : Promise.resolve(),
      dlqConnection.quit(),
      workerRedis.quit(),
      redis.quit()
    ]);
    await prismaClient.$disconnect();
  };

  // --- Signal handlers (M3) ---
  // process.once() prevents double-invocation if operator sends SIGINT twice quickly
  process.once('SIGINT', () => {
    void shutdown().then(() => {
      process.exit(0);
    });
  });

  process.once('SIGTERM', () => {
    void shutdown().then(() => {
      process.exit(0);
    });
  });

  // --- Process crash boundary handlers (C2) ---
  // Same rationale as the API process (C1): Node 22 kills on unhandled rejections.
  // We log and attempt an orderly shutdown.
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ reason }, 'Worker unhandled promise rejection — initiating shutdown');
    void shutdown().finally(() => process.exit(1));
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Worker uncaught exception — initiating shutdown');
    void shutdown().finally(() => process.exit(1));
  });
}

bootstrapWorkers().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
