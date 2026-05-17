import { Worker, type ConnectionOptions } from 'bullmq';
import { PrismaClient as RealPrismaClient } from '@prisma/client';

type CartCleanupWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
};

export function createCartCleanupWorker(
  connection: ConnectionOptions,
  deps?: CartCleanupWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const prisma = new PrismaClientCtor();

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
    },
    { connection }
  );
}

