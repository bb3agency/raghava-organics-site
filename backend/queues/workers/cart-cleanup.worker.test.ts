import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCartCleanupWorker } from './cart-cleanup.worker';

type CartCleanupWorkerDeps = NonNullable<Parameters<typeof createCartCleanupWorker>[1]>;
type CartCleanupWorkerType = NonNullable<CartCleanupWorkerDeps['Worker']>;
type CartCleanupPrismaType = NonNullable<CartCleanupWorkerDeps['PrismaClient']>;

describe('cart-cleanup worker', () => {
  let processor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
  const cartDeleteMany = vi.fn();
  const reservationDeleteMany = vi.fn();
  const idempotencyDeleteMany = vi.fn();
  const outboxDeleteMany = vi.fn();
  const refreshTokenDeleteMany = vi.fn();
  const opsUserInviteDeleteMany = vi.fn();
  const opsOtpChallengeDeleteMany = vi.fn();

  function MockWorker(_name: string, proc: (job: { name: string; data: unknown }) => Promise<void>) {
    processor = proc;
  }

  function MockPrismaClient() {
    return {
      cart: { deleteMany: cartDeleteMany },
      cartReservation: { deleteMany: reservationDeleteMany },
      idempotencyRecord: { deleteMany: idempotencyDeleteMany },
      outboxMessage: { deleteMany: outboxDeleteMany },
      refreshToken: { deleteMany: refreshTokenDeleteMany },
      opsUserInvite: { deleteMany: opsUserInviteDeleteMany },
      opsOtpChallenge: { deleteMany: opsOtpChallengeDeleteMany }
    };
  }

  const workerDeps = {
    Worker: MockWorker as unknown as CartCleanupWorkerType,
    PrismaClient: MockPrismaClient as unknown as CartCleanupPrismaType
  };

  beforeEach(() => {
    processor = undefined;
    cartDeleteMany.mockReset();
    reservationDeleteMany.mockReset();
    idempotencyDeleteMany.mockReset();
    outboxDeleteMany.mockReset();
    refreshTokenDeleteMany.mockReset();
    opsUserInviteDeleteMany.mockReset();
    opsOtpChallengeDeleteMany.mockReset();
  });

  it('deletes expired guest carts for scheduled cleanup job', async () => {
    createCartCleanupWorker({}, workerDeps);
    cartDeleteMany.mockResolvedValue({ count: 3 });

    await processor?.({
      name: 'delete-expired-guest-carts',
      data: {}
    });

    expect(cartDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: null,
          expiresAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('purges expired idempotency records', async () => {
    createCartCleanupWorker({}, workerDeps);
    idempotencyDeleteMany.mockResolvedValue({ count: 5 });

    await processor?.({
      name: 'purge-expired-idempotency-records',
      data: {}
    });

    expect(idempotencyDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('purges published outbox messages older than 7 days', async () => {
    createCartCleanupWorker({}, workerDeps);
    outboxDeleteMany.mockResolvedValue({ count: 2 });

    await processor?.({
      name: 'purge-published-outbox-messages',
      data: {}
    });

    expect(outboxDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          createdAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('purges expired refresh tokens', async () => {
    createCartCleanupWorker({}, workerDeps);
    refreshTokenDeleteMany.mockResolvedValue({ count: 4 });

    await processor?.({
      name: 'purge-expired-refresh-tokens',
      data: {}
    });

    expect(refreshTokenDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('purges expired ops invites', async () => {
    createCartCleanupWorker({}, workerDeps);
    opsUserInviteDeleteMany.mockResolvedValue({ count: 2 });

    await processor?.({
      name: 'purge-expired-ops-invites',
      data: {}
    });

    expect(opsUserInviteDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: ['CREATED', 'EMAIL_SENT'] }),
          expiresAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('purges expired ops otp challenges', async () => {
    createCartCleanupWorker({}, workerDeps);
    opsOtpChallengeDeleteMany.mockResolvedValue({ count: 3 });

    await processor?.({
      name: 'purge-expired-ops-otp-challenges',
      data: {}
    });

    expect(opsOtpChallengeDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: ['PENDING', 'FAILED', 'EXPIRED'] }),
          expiresAt: expect.objectContaining({ lt: expect.any(Date) })
        })
      })
    );
  });

  it('ignores unknown cart-cleanup jobs', async () => {
    createCartCleanupWorker({}, workerDeps);

    await processor?.({
      name: 'unknown-job',
      data: {}
    });

    expect(cartDeleteMany).not.toHaveBeenCalled();
    expect(idempotencyDeleteMany).not.toHaveBeenCalled();
    expect(outboxDeleteMany).not.toHaveBeenCalled();
    expect(refreshTokenDeleteMany).not.toHaveBeenCalled();
    expect(opsUserInviteDeleteMany).not.toHaveBeenCalled();
    expect(opsOtpChallengeDeleteMany).not.toHaveBeenCalled();
  });
});

