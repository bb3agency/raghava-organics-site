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
import { sendTechnicalFailureAlert } from '../../src/modules/notifications/notification-failure-alert';
import { SYSTEM_RESTART_CHANNEL } from '../../src/common/restart/system-restart';

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
  // GST invoicing fields are DB-backed; validated post-overlay below.
  if (isEnabled(process.env.OTEL_TRACING_ENABLED)) {
    requireWorkerEnv('OTEL_EXPORTER_OTLP_ENDPOINT');
  }
  const shippingProviderRaw = (process.env.SHIPPING_PROVIDER ?? '').trim().toLowerCase();
  const shippingProvider = shippingProviderRaw || 'delhivery';
  if (!shippingProviderRaw) {
    // Allow first bootstrap without provider mode set in env.
  } else if (shippingProvider === 'delhivery') {
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

  // Validate required DB-backed StoreSettings metadata (no fallback)
  try {
    const settings = await prismaClient.storeSettings.findUnique({
      where: { singletonKey: 'default' },
      select: { storeName: true, websiteUrl: true, sellerLegalName: true, sellerAddress: true, sellerState: true, gstin: true }
    });
    const missing: string[] = [];
    if (!settings?.storeName || settings.storeName.trim().length === 0) {
      missing.push('StoreSettings.storeName');
    }
    if (!settings?.websiteUrl || settings.websiteUrl.trim().length === 0) {
      missing.push('StoreSettings.websiteUrl');
    }
    // If GST invoicing feature is enabled, ensure seller fields exist in DB.
    if (isEnabled(process.env.FEATURE_GST_INVOICING_ENABLED)) {
      if (!settings?.sellerLegalName || settings.sellerLegalName.trim().length === 0) missing.push('StoreSettings.sellerLegalName');
      if (!settings?.sellerAddress || settings.sellerAddress.trim().length === 0) missing.push('StoreSettings.sellerAddress');
      if (!settings?.sellerState || settings.sellerState.trim().length === 0) missing.push('StoreSettings.sellerState');
      if (!settings?.gstin || settings.gstin.trim().length === 0) missing.push('StoreSettings.gstin');
    }
    if (missing.length > 0) {
      void sendTechnicalFailureAlert({
        prisma: prismaClient,
        template: 'ConfigurationMissing',
        channel: 'UNKNOWN',
        recipient: 'worker-runtime',
        errorMessage: `Missing required DB-backed configuration: ${missing.join(', ')}`,
        failureStage: 'CORE_LOGIC',
        domain: 'workers',
        component: 'startup-config-check'
      });
    }
  } catch (err) {
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'ConfigurationCheckError',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: err instanceof Error ? err.message : 'Unknown configuration check error',
      failureStage: 'CORE_LOGIC',
      domain: 'workers',
      component: 'startup-config-check'
    });
  }

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
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'WorkerRedisPrimary',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: err.message,
      failureStage: 'CORE_LOGIC',
      domain: 'workers',
      component: 'worker-redis-primary'
    });
  });
  workerRedis.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker Redis client error (worker)');
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'WorkerRedisWorker',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: err.message,
      failureStage: 'CORE_LOGIC',
      domain: 'workers',
      component: 'worker-redis-worker'
    });
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
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'WorkerRedisDlq',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: err.message,
      failureStage: 'CORE_LOGIC',
      domain: 'workers',
      component: 'worker-redis-dlq'
    });
  });

  const deadLetterQueue = new Queue('dead-letter', {
    connection: dlqConnection,
    defaultJobOptions: dlqJobOptions
  });

  const failureAlertHandler = (context: {
    queue: string;
    jobName: string;
    jobId: string;
    attempt: number;
    maxAttempts: number;
    terminalFailure: boolean;
    errorMessage: string;
    originalData: unknown;
  }) => {
    const payload = context.originalData;
    const template =
      payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).template === 'string'
        ? String((payload as Record<string, unknown>).template)
        : `${context.queue}:${context.jobName}`;
    const recipient = (() => {
      if (!payload || typeof payload !== 'object') {
        return 'system-worker';
      }
      const p = payload as Record<string, unknown>;
      const val = (typeof p['to'] === 'string' ? p['to'] : undefined)
        ?? (typeof p['email'] === 'string' ? p['email'] : undefined)
        ?? (typeof p['phone'] === 'string' ? p['phone'] : undefined);
      return val ?? 'system-worker';
    })();

    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template,
      channel: 'UNKNOWN',
      recipient,
      errorMessage: context.errorMessage,
      failureStage: context.terminalFailure ? 'WORKER_TERMINAL' : 'WORKER_DELIVERY',
      domain: 'workers',
      component: context.queue,
      queueName: context.queue,
      jobName: context.jobName,
      jobId: context.jobId,
      terminalFailure: context.terminalFailure
    });
  };

  const dlqFailureAlertHandler = (context: { queue: string; jobName: string; jobId: string; errorMessage: string }) => {
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: `${context.queue}:${context.jobName}`,
      channel: 'UNKNOWN',
      recipient: 'dead-letter-queue',
      errorMessage: context.errorMessage,
      failureStage: 'WORKER_TERMINAL',
      domain: 'workers',
      component: 'dead-letter-enqueue',
      queueName: context.queue,
      jobName: context.jobName,
      jobId: context.jobId,
      terminalFailure: true
    });
  };

  const stallAlertHandler = (context: { queue: string; jobId: string }) => {
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: `${context.queue}:stalled`,
      channel: 'UNKNOWN',
      recipient: 'worker-stall',
      errorMessage: `Job ${context.jobId} stalled in queue ${context.queue}`,
      failureStage: 'WORKER_STALL',
      domain: 'workers',
      component: context.queue,
      queueName: context.queue,
      jobId: context.jobId
    });
  };

  attachWorkerLogging(orderProcessingWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(shippingWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(notificationsWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(inventoryAlertsWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(refundsWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(cartCleanupWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(analyticsWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(outboxDispatchWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(reconciliationWorker, logger, deadLetterQueue, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);
  attachWorkerLogging(deadLetterWorker, logger, undefined, failureAlertHandler, dlqFailureAlertHandler, stallAlertHandler);

  let shiprocketRefreshQueue: Queue | null = null;
  let shiprocketRefreshConnection: IORedis | null = null;
  if ((process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase() === 'shiprocket') {
    shiprocketRefreshConnection = workerRedis.duplicate();
    shiprocketRefreshConnection.on('error', (err) => {
      logger.error({ err: err.message }, 'Worker Redis client error (Shiprocket refresh queue)');
      void sendTechnicalFailureAlert({
        prisma: prismaClient,
        template: 'WorkerRedisShiprocketRefresh',
        channel: 'UNKNOWN',
        recipient: 'worker-runtime',
        errorMessage: err.message,
        failureStage: 'CORE_LOGIC',
        domain: 'workers',
        component: 'worker-redis-shiprocket-refresh'
      });
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
        void sendTechnicalFailureAlert({
          prisma: prismaClient,
          template: 'ShiprocketTokenRefreshSchedule',
          channel: 'UNKNOWN',
          recipient: 'shiprocket-scheduler',
          errorMessage: err instanceof Error ? err.message : String(err),
          failureStage: 'CORE_LOGIC',
          domain: 'shipping',
          component: 'shiprocket-token-refresh-schedule'
        });
      });
  }

  logger.info('All background workers started successfully and are listening for jobs.');

  // --- Shutdown orchestration ---
  // restartSubscriber is declared here so shutdown() can close it on any exit path.
  let restartSubscriber: ReturnType<typeof workerRedis.duplicate> | null = null;
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
        void sendTechnicalFailureAlert({
          prisma: prismaClient,
          template: 'WorkerShutdownClose',
          channel: 'UNKNOWN',
          recipient: 'worker-runtime',
          errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
          failureStage: 'CORE_LOGIC',
          domain: 'workers',
          component: 'worker-shutdown-close'
        });
      }
    }
    // Redis quit() must always run regardless of close() failures above
    await Promise.allSettled([
      restartSubscriber ? restartSubscriber.quit() : Promise.resolve(),
      shiprocketRefreshConnection ? shiprocketRefreshConnection.quit() : Promise.resolve(),
      dlqConnection.quit(),
      workerRedis.quit(),
      redis.quit()
    ]);
    await prismaClient.$disconnect();
  };

  // --- Restart signal subscriber ---
  // Subscribes to the same channel the cart-cleanup worker publishes to when a
  // scheduled-process-restart BullMQ job fires. This ensures the worker process
  // also initiates a graceful shutdown alongside the API process.
  // A duplicate connection is used because ioredis pub/sub mode blocks the connection.
  restartSubscriber = workerRedis.duplicate();
  restartSubscriber.on('error', (err) => {
    logger.warn({ err: err.message }, 'Restart subscriber Redis error — restart signal may not be received');
  });
  restartSubscriber.subscribe(SYSTEM_RESTART_CHANNEL, (err) => {
    if (err) {
      logger.warn({ err: err.message }, 'Failed to subscribe to restart channel');
    }
  });
  restartSubscriber.on('message', (channel: string) => {
    if (channel !== SYSTEM_RESTART_CHANNEL) return;
    logger.info('System restart signal received — initiating graceful worker shutdown');
    // shutdown() already calls restartSubscriber.quit() internally.
    void shutdown().finally(() => process.exit(0));
  });

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
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'WorkerUnhandledRejection',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: reason instanceof Error ? reason.message : String(reason),
      failureStage: 'PROCESS_RESTART',
      domain: 'workers',
      component: 'worker-process',
      terminalFailure: true
    });
    void shutdown().finally(() => process.exit(1));
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Worker uncaught exception — initiating shutdown');
    void sendTechnicalFailureAlert({
      prisma: prismaClient,
      template: 'WorkerUncaughtException',
      channel: 'UNKNOWN',
      recipient: 'worker-runtime',
      errorMessage: error.message,
      failureStage: 'PROCESS_RESTART',
      domain: 'workers',
      component: 'worker-process',
      terminalFailure: true
    });
    void shutdown().finally(() => process.exit(1));
  });
}

bootstrapWorkers().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
