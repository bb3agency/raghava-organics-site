import { Worker, type ConnectionOptions } from 'bullmq';
import { PrismaClient as RealPrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { sendProcessRestartAlert, sendTechnicalFailureAlert } from '@modules/notifications/notification-failure-alert';
import { publishRestartSignal, SYSTEM_RESTART_CHANNEL, type RestartPublisherLike } from '@common/restart/system-restart';
import { LOAD_SHED_MODE_KEY } from '@common/reliability/load-shed.guard';

/**
 * Maximum time (ms) to wait for in-flight PENDING_PAYMENT orders to reach
 * a terminal state before forcing the restart anyway.
 * Default: 5 minutes. Override via RESTART_PAYMENT_DRAIN_TIMEOUT_MS env var.
 */
const DEFAULT_PAYMENT_DRAIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Interval (ms) between DB polls while waiting for payments to drain.
 */
const PAYMENT_DRAIN_POLL_INTERVAL_MS = 5_000;

export type CartCleanupWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  /**
   * Injectable Redis publisher for tests — avoids real IORedis connection.
   * If omitted, a real IORedis client is created from REDIS_URL at restart time.
   * Return null to simulate a missing REDIS_URL.
   */
  createPublisher?: () => (RestartPublisherLike & { quit: () => Promise<unknown> }) | null;
  /**
   * Injectable sleep function for tests — replaces setTimeout delay.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Payment drain timeout override in ms (for tests).
   */
  paymentDrainTimeoutMs?: number;
};

export function createCartCleanupWorker(
  connection: ConnectionOptions,
  deps?: CartCleanupWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const prisma = new PrismaClientCtor();
  const sleepFn = deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const paymentDrainTimeoutMs =
    deps?.paymentDrainTimeoutMs ??
    (process.env['RESTART_PAYMENT_DRAIN_TIMEOUT_MS']
      ? Number(process.env['RESTART_PAYMENT_DRAIN_TIMEOUT_MS'])
      : DEFAULT_PAYMENT_DRAIN_TIMEOUT_MS);

  const deleteManyIfDelegateExists = async (delegateName: string, where: Record<string, unknown>) => {
    const delegate = (prisma as unknown as Record<string, unknown>)[delegateName] as
      | { deleteMany?: (args: { where: Record<string, unknown> }) => Promise<unknown> }
      | undefined;
    if (delegate?.deleteMany) {
      await delegate.deleteMany({ where });
    }
  };

  return new WorkerCtor(
    'cart-cleanup',
    async (job) => {
      if (job.name === 'delete-expired-guest-carts') {
        await prisma.cart.deleteMany({
          where: {
            userId: null,
            expiresAt: {
              lt: new Date()
            }
          }
        });
        return;
      }

      if (job.name === 'release-expired-reservations') {
        await prisma.cartReservation.deleteMany({
          where: {
            expiresAt: {
              lt: new Date()
            }
          }
        });
        return;
      }

      if (job.name === 'purge-expired-idempotency-records') {
        await prisma.idempotencyRecord.deleteMany({
          where: {
            expiresAt: {
              lt: new Date()
            }
          }
        });
        return;
      }

      if (job.name === 'purge-published-outbox-messages') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await prisma.outboxMessage.deleteMany({
          where: {
            status: 'PUBLISHED',
            createdAt: {
              lt: cutoff
            }
          }
        });
        return;
      }

      if (job.name === 'purge-expired-refresh-tokens') {
        await prisma.refreshToken.deleteMany({
          where: {
            expiresAt: {
              lt: new Date()
            }
          }
        });
        return;
      }

      if (job.name === 'purge-expired-ops-invites') {
        await deleteManyIfDelegateExists('opsUserInvite', {
          status: {
            in: ['CREATED', 'EMAIL_SENT']
          },
          expiresAt: {
            lt: new Date()
          }
        });
        return;
      }

      if (job.name === 'purge-expired-ops-otp-challenges') {
        await deleteManyIfDelegateExists('opsOtpChallenge', {
          status: {
            in: ['PENDING', 'FAILED', 'EXPIRED']
          },
          expiresAt: {
            lt: new Date()
          }
        });
        return;
      }

      if (job.name === 'scheduled-process-restart') {
        const jobId = String(job.id ?? 'unknown');
        const requestedBy = String(job.data?.requestedBy ?? 'unknown');
        const scheduledFor = String(job.data?.scheduledFor ?? new Date().toISOString());

        // ── Step 1: Payment-safe drain ──────────────────────────────────────────
        // Poll the DB until all orders in PENDING_PAYMENT reach a terminal state
        // (CONFIRMED, PAYMENT_FAILED, CANCELLED, etc.) or the timeout elapses.
        // This ensures no in-flight payment is orphaned by the restart.
        const orderDelegate = (prisma as unknown as {
          order?: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
        }).order;

        if (orderDelegate?.count) {
          const drainDeadline = Date.now() + paymentDrainTimeoutMs;
          let pendingCount = await orderDelegate.count({ where: { status: 'PENDING_PAYMENT' } });

          while (pendingCount > 0 && Date.now() < drainDeadline) {
            await sleepFn(PAYMENT_DRAIN_POLL_INTERVAL_MS);
            pendingCount = await orderDelegate.count({ where: { status: 'PENDING_PAYMENT' } });
          }

          if (pendingCount > 0) {
            // Timeout elapsed — alert ops/admin that restart is proceeding with in-flight payments.
            await sendTechnicalFailureAlert({
              prisma,
              template: 'ProcessRestartPaymentDrainTimeout',
              channel: 'UNKNOWN',
              recipient: 'ops-restart',
              errorMessage: `Restart proceeding with ${pendingCount} PENDING_PAYMENT order(s) still in-flight after ${paymentDrainTimeoutMs}ms drain timeout. Manual reconciliation may be required.`,
              failureStage: 'PROCESS_RESTART',
              domain: 'ops',
              component: 'scheduled-process-restart',
              jobId,
              terminalFailure: false
            });
          }
        }

        // ── Step 2: Pre-exit alert ──────────────────────────────────────────────
        // Notify ops/admin users that the restart is imminent. Best-effort.
        try {
          await sendProcessRestartAlert({ prisma, requestedBy, scheduledFor, jobId });
        } catch {
          // Non-fatal — alert failure must never block the restart.
        }

        // ── Step 3: Publish restart signal ─────────────────────────────────────
        // The API process and worker-index both subscribe to SYSTEM_RESTART_CHANNEL.
        // Publishing here triggers graceful shutdown in both processes simultaneously.
        const createPublisher = deps?.createPublisher ?? (() => {
          const redisUrl = process.env['REDIS_URL'];
          if (!redisUrl) return null;
          return new IORedis(redisUrl, { maxRetriesPerRequest: null, family: 4 });
        });

        let publisher: (RestartPublisherLike & { quit: () => Promise<unknown> }) | null = null;
        try {
          publisher = createPublisher();
          if (publisher) {
            // Reset load-shed to 'normal' before signalling restart so both
            // containers come back up in normal serving mode. Best-effort —
            // a failure here must not block the restart itself.
            await publisher.set(LOAD_SHED_MODE_KEY, 'normal').catch(() => { /* best-effort */ });
            await publishRestartSignal(publisher, { jobId, requestedBy, scheduledFor });
          }
        } catch (publishErr) {
          // Publish failed — alert ops/admin so they know the API process will NOT
          // restart automatically and manual intervention is required.
          await sendTechnicalFailureAlert({
            prisma,
            template: 'ProcessRestartPublishFailed',
            channel: 'UNKNOWN',
            recipient: 'ops-restart',
            errorMessage: `Failed to publish restart signal on ${SYSTEM_RESTART_CHANNEL}: ${publishErr instanceof Error ? publishErr.message : String(publishErr)}. The worker process will exit but the API process must be restarted manually.`,
            failureStage: 'PROCESS_RESTART',
            domain: 'ops',
            component: 'scheduled-process-restart',
            jobId,
            terminalFailure: true
          });
        } finally {
          await publisher?.quit().catch(() => { /* best-effort */ });
        }

        // ── Step 4: Exit worker process ────────────────────────────────────────
        // Docker restart: unless-stopped brings the worker container back.
        // The API process exits independently on receipt of the pub/sub message.
        process.exit(0);
      }
    },
    { connection }
  );
}

