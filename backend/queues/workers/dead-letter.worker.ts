import { Worker, type ConnectionOptions } from 'bullmq';

/**
 * Dead Letter Queue (DLQ) Worker
 *
 * This is a no-op holding pen for terminal failures from all other queues.
 * Jobs land here when they exhaust all retry attempts in their source queue.
 *
 * Admin can inspect and retry jobs via Bull Board UI at /api/v1/admin/queues.
 * The worker simply logs receipt for audit trail — it does NOT auto-process.
 */
export function createDeadLetterWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    'dead-letter',
    async () => {
      // No-op: DLQ is a holding pen for admin inspection.
      // Jobs are retained indefinitely (removeOnComplete: false, removeOnFail: false).
      // Admins can retry individual jobs via Bull Board UI.
    },
    {
      connection,
      concurrency: 1,
      autorun: true
    }
  );
}
