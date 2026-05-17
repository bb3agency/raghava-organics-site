import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AdminInvitesService } from './admin-invites.service';

function createHarness() {
  const adminUserInviteCreate = vi.fn(async () => ({ id: 'invite_1' }));
  const adminUserInviteUpdate = vi.fn(async () => ({ id: 'invite_1' }));
  const adminUserInviteFindUnique = vi.fn();
  const adminUserInviteUpdateMany = vi.fn(async () => ({ count: 2 }));
  const userFindUnique = vi.fn(async () => null);
  const userFindFirst = vi.fn(async () => null);
  const opsUserFindUnique = vi.fn();
  const redisGet = vi.fn();
  const redisSet = vi.fn(async () => 'OK');
  const redisDel = vi.fn(async () => 1);
  const redisIncr = vi.fn(async () => 1);
  const redisExpire = vi.fn(async () => 1);
  const txUserCreate = vi.fn(async () => ({
    id: 'admin_1',
    email: 'merchant@example.com',
    firstName: 'Merchant',
    lastName: 'Owner'
  }));
  const txGrantCreateMany = vi.fn(async () => ({ count: 3 }));
  const txInviteUpdate = vi.fn(async () => ({ id: 'invite_1' }));
  const transaction = vi.fn(
    async (
      callback: (tx: {
        user: { create: typeof txUserCreate };
        adminPermissionGrant: { createMany: typeof txGrantCreateMany };
        adminUserInvite: { update: typeof txInviteUpdate };
      }) => Promise<unknown>
    ) =>
      callback({
        user: { create: txUserCreate },
        adminPermissionGrant: { createMany: txGrantCreateMany },
        adminUserInvite: { update: txInviteUpdate }
      })
  );
  const notificationsAdd = vi.fn(async () => ({ id: 'job_1' }));
  const fastify = {
    prisma: {
      user: { findUnique: userFindUnique, findFirst: userFindFirst },
      opsUser: { findUnique: opsUserFindUnique },
      adminUserInvite: {
        create: adminUserInviteCreate,
        update: adminUserInviteUpdate,
        findUnique: adminUserInviteFindUnique,
        updateMany: adminUserInviteUpdateMany
      },
      $transaction: transaction
    },
    queues: {
      notifications: { add: notificationsAdd }
    },
    redis: {
      get: redisGet,
      set: redisSet,
      del: redisDel,
      incr: redisIncr,
      expire: redisExpire
    }
  } as unknown as ConstructorParameters<typeof AdminInvitesService>[0];
  return {
    service: new AdminInvitesService(fastify),
    mocks: {
      adminUserInviteCreate,
      adminUserInviteUpdate,
      adminUserInviteFindUnique,
      adminUserInviteUpdateMany,
      userFindUnique,
      userFindFirst,
      opsUserFindUnique,
      redisGet,
      redisSet,
      redisDel,
      redisIncr,
      redisExpire,
      txUserCreate,
      txGrantCreateMany,
      txInviteUpdate,
      transaction,
      notificationsAdd
    }
  };
}

describe('AdminInvitesService', () => {
  it('creates merchant admin invites with default merchant permissions and admin setup URL', async () => {
    const { service, mocks } = createHarness();

    const result = await service.createAdminInvite({
      createdByOpsUserId: 'ops_1',
      inviteEmail: 'Merchant@Example.com',
      inviteName: 'Merchant Owner',
      setupBaseUrl: 'https://client.example.com'
    });

    expect(result.setupUrl).toContain('/admin/setup?token=');
    expect(result.permissions).toContain('products:write');
    expect(result.permissions).toContain('orders:read');
    expect(result.permissions).not.toContain('ops:read');
    expect(mocks.adminUserInviteCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inviteEmail: 'merchant@example.com',
        inviteName: 'Merchant Owner',
        status: 'CREATED',
        createdByOpsUserId: 'ops_1'
      })
    }));
    expect(mocks.notificationsAdd).toHaveBeenCalledWith('send-email', expect.objectContaining({
      to: 'merchant@example.com',
      template: 'AdminInviteSetup'
    }), expect.any(Object));
    expect(mocks.adminUserInviteUpdate).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: { status: 'EMAIL_SENT' }
    });
  });

  it('rejects developer permissions in merchant admin invites', async () => {
    const { service } = createHarness();

    await expect(service.createAdminInvite({
      inviteEmail: 'merchant@example.com',
      inviteName: 'Merchant Owner',
      setupBaseUrl: 'https://client.example.com',
      permissions: ['products:read', 'ops:read']
    })).rejects.toThrow('Permission is not allowed for merchant admin invite: ops:read');
  });

  it('consumes an active invite by creating an admin user and permission grants once', async () => {
    const { service, mocks } = createHarness();
    mocks.adminUserInviteFindUnique.mockResolvedValue({
      id: 'invite_1',
      inviteEmail: 'merchant@example.com',
      inviteName: 'Merchant Owner',
      status: 'EMAIL_SENT',
      permissions: ['products:read', 'orders:read'],
      expiresAt: new Date(Date.now() + 60_000)
    });

    const inviteTokenHash = crypto.createHash('sha256').update('token_1234567890').digest('hex');
    const otpHash = crypto.createHash('sha256').update('123456').digest('hex');
    mocks.redisGet.mockImplementation(async (key: string) => {
      if (key === `admin-invite:setup:payload:${inviteTokenHash}`) {
        return JSON.stringify({
          name: 'Merchant Owner',
          phone: '+911234567890',
          passwordHash: 'stored-password-hash'
        });
      }
      if (key === `admin-invite:setup:otp:${inviteTokenHash}`) {
        return otpHash;
      }
      return null;
    });

    const result = await service.consumeAdminInvite({
      inviteToken: 'token_1234567890',
      otp: '123456'
    });

    expect(result).toEqual({
      adminUserId: 'admin_1',
      email: 'merchant@example.com',
      name: 'Merchant Owner',
      permissions: ['products:read', 'orders:read'],
      mfaRequired: false
    });
    expect(mocks.txUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'merchant@example.com',
        phone: '+911234567890',
        passwordHash: 'stored-password-hash',
        firstName: 'Merchant',
        lastName: 'Owner',
        role: 'ADMIN',
        isVerified: true
      })
    });
    expect(mocks.txGrantCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: 'admin_1', permission: 'products:read' },
        { userId: 'admin_1', permission: 'orders:read' }
      ],
      skipDuplicates: true
    });
    expect(mocks.txInviteUpdate).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: expect.objectContaining({ status: 'CONSUMED' })
    });
  });

  it('marks expired invites as expired and fails closed', async () => {
    const { service, mocks } = createHarness();
    mocks.adminUserInviteFindUnique.mockResolvedValue({
      id: 'invite_1',
      inviteEmail: 'merchant@example.com',
      inviteName: 'Merchant Owner',
      status: 'EMAIL_SENT',
      permissions: ['products:read'],
      expiresAt: new Date(Date.now() - 60_000)
    });

    await expect(service.consumeAdminInvite({
      inviteToken: 'token_1234567890',
      otp: '123456'
    })).rejects.toThrow('Admin invite has expired');
    expect(mocks.adminUserInviteUpdate).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: { status: 'EXPIRED_CLEANED' }
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('cleans up expired active merchant admin invites', async () => {
    const { service, mocks } = createHarness();

    await expect(service.cleanupExpiredAdminInvites()).resolves.toEqual({ cleaned: 2 });
    expect(mocks.adminUserInviteUpdateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['CREATED', 'EMAIL_SENT'] },
        expiresAt: { lt: expect.any(Date) }
      },
      data: { status: 'EXPIRED_CLEANED' }
    });
  });

  it('rejects createAdminInvite when email already belongs to an ops account', async () => {
    const { service, mocks } = createHarness();
    mocks.opsUserFindUnique.mockResolvedValueOnce({ id: 'ops_1', email: 'shared@example.com' });

    await expect(
      service.createAdminInvite({
        inviteEmail: 'shared@example.com',
        inviteName: 'Merchant Owner',
        setupBaseUrl: 'https://client.example.com'
      })
    ).rejects.toThrow('Email is already in use by an ops account');

    expect(mocks.adminUserInviteCreate).not.toHaveBeenCalled();
  });
});
