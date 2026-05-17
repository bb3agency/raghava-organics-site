import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '@common/errors/error-codes';
import { OpsService } from './ops.service';

function createOpsServiceHarness() {
  const redisGet = vi.fn();
  const redisIncr = vi.fn(async () => 1);
  const redisExpire = vi.fn(async () => 1);
  const redisDel = vi.fn(async () => 1);
  const redisSet = vi.fn(async () => 'OK');
  const redisEval = vi.fn(async () => 1);

  const opsUserInviteFindUnique = vi.fn();
  const opsUserInviteCreate = vi.fn();
  const opsUserInviteUpdate = vi.fn();
  const opsUserInviteDelete = vi.fn();
  const opsUserInviteFindMany = vi.fn();
  const opsUserInviteDeleteMany = vi.fn();

  const userFindUnique = vi.fn();

  const opsUserFindUnique = vi.fn();
  const opsUserFindFirst = vi.fn(async () => null);
  const opsUserCreate = vi.fn();

  const opsOtpChallengeFindUnique = vi.fn();
  const opsOtpChallengeCreate = vi.fn();
  const opsOtpChallengeUpdate = vi.fn();

  const opsConfigSecretFindMany = vi.fn(async () => []);
  const opsConfigSecretUpsert = vi.fn();

  const opsAuditLogFindFirst = vi.fn(async () => null);
  const opsAuditLogCreate = vi.fn(async () => ({}));

  const fastify = {
    prisma: {
      user: {
        findUnique: userFindUnique
      },
      opsUserInvite: {
        findUnique: opsUserInviteFindUnique,
        create: opsUserInviteCreate,
        update: opsUserInviteUpdate,
        delete: opsUserInviteDelete,
        findMany: opsUserInviteFindMany,
        deleteMany: opsUserInviteDeleteMany
      },
      opsUser: {
        findUnique: opsUserFindUnique,
        findFirst: opsUserFindFirst,
        create: opsUserCreate
      },
      opsOtpChallenge: {
        findUnique: opsOtpChallengeFindUnique,
        create: opsOtpChallengeCreate,
        update: opsOtpChallengeUpdate
      },
      opsConfigSecret: {
        findMany: opsConfigSecretFindMany,
        upsert: opsConfigSecretUpsert
      },
      opsAuditLog: {
        findFirst: opsAuditLogFindFirst,
        create: opsAuditLogCreate,
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      opsDualApprovalRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
        update: vi.fn()
      }
    },
    redis: {
      get: redisGet,
      set: redisSet,
      del: redisDel,
      incr: redisIncr,
      expire: redisExpire,
      eval: redisEval
    },
    queues: {
      notifications: {
        add: vi.fn(async () => undefined)
      }
    }
  } as unknown as FastifyInstance;

  return {
    service: new OpsService(fastify),
    fastify,
    mocks: {
      redisSet,
      redisGet,
      redisDel,
      redisIncr,
      redisExpire,
      redisEval,
      opsUserInviteFindUnique,
      opsUserInviteCreate,
      opsUserInviteUpdate,
      opsUserInviteDelete,
      opsUserInviteFindMany,
      opsUserInviteDeleteMany,
      opsUserFindUnique,
      userFindUnique,
      opsUserFindFirst,
      opsUserCreate,
      opsOtpChallengeFindUnique,
      opsOtpChallengeCreate,
      opsOtpChallengeUpdate,
      opsConfigSecretFindMany,
      opsConfigSecretUpsert,
      opsAuditLogFindFirst,
      opsAuditLogCreate,
      notificationsAdd: (fastify as unknown as { queues: { notifications: { add: ReturnType<typeof vi.fn> } } }).queues.notifications.add
    }
  };
}

describe('OpsService cross-table email collision guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPS_DB_ENCRYPTION_KEY = 'test-ops-db-encryption-key';
    process.env.OPS_DB_ENCRYPTION_KEY_VERSION = '1';
  });

  it('createOpsInvite rejects when email is already a customer/admin User', async () => {
    const { service, mocks } = createOpsServiceHarness();
    mocks.userFindUnique.mockResolvedValueOnce({ id: 'customer_1', email: 'shared@example.com' });

    await expect(
      service.createOpsInvite({
        inviteEmail: 'shared@example.com',
        inviteName: 'Ops Person',
        permissions: ['OPS_READ'],
        ipAllowlist: [],
        setupBaseUrl: 'https://example.com',
        requestIp: '127.0.0.1',
        requestPath: '/api/v1/ops/invites',
        method: 'POST'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: ERROR_CODES.CONFLICT });

    expect(mocks.opsUserInviteCreate).not.toHaveBeenCalled();
  });

  it('createOpsInvite rejects when email already exists as an OpsUser', async () => {
    const { service, mocks } = createOpsServiceHarness();
    mocks.userFindUnique.mockResolvedValueOnce(null);
    mocks.opsUserFindUnique.mockResolvedValueOnce({ id: 'ops_1', email: 'shared@example.com' });

    await expect(
      service.createOpsInvite({
        inviteEmail: 'shared@example.com',
        inviteName: 'Ops Person',
        permissions: ['OPS_READ'],
        ipAllowlist: [],
        setupBaseUrl: 'https://example.com',
        requestIp: '127.0.0.1',
        requestPath: '/api/v1/ops/invites',
        method: 'POST'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: ERROR_CODES.CONFLICT });

    expect(mocks.opsUserInviteCreate).not.toHaveBeenCalled();
  });
});

describe('OpsService failcase coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPS_DB_ENCRYPTION_KEY = 'test-ops-db-encryption-key';
    process.env.OPS_DB_ENCRYPTION_KEY_VERSION = '1';
  });

  it('consumeOpsInvite rejects expired invites and removes invite record', async () => {
    const { service, mocks } = createOpsServiceHarness();

    mocks.opsUserInviteFindUnique.mockResolvedValue({
      id: 'invite_1',
      inviteEmail: 'ops@example.com',
      inviteName: 'Ops User',
      status: 'CREATED',
      expiresAt: new Date(Date.now() - 1_000),
      ipAllowlist: ['203.0.113.10/32'],
      permissions: ['OPS_READ']
    });

    await expect(
      service.consumeOpsInvite({
        inviteToken: 'expired-token',
        otp: '123456',
        requestIp: '127.0.0.1',
        requestPath: '/api/v1/ops/invites/consume',
        method: 'POST'
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_EXPIRED,
      statusCode: 401
    });

    expect(mocks.opsUserInviteDelete).toHaveBeenCalledWith({
      where: { id: 'invite_1' }
    });
  });

  it('verifyEmailOtp marks challenge failed after max attempts', async () => {
    const { service, mocks } = createOpsServiceHarness();

    const expectedCodeHash = crypto.createHash('sha256').update('654321').digest('hex');
    mocks.opsOtpChallengeFindUnique.mockResolvedValue({
      id: 'challenge_1',
      opsUserId: 'ops_1',
      status: 'PENDING',
      codeHash: expectedCodeHash,
      expiresAt: new Date(Date.now() + 60_000),
      failedAttempts: 2
    });

    await expect(
      service.verifyEmailOtp({
        opsUserId: 'ops_1',
        challengeId: 'challenge_1',
        code: '123456',
        requestIp: '127.0.0.1',
        requestPath: '/api/v1/ops/otp/verify',
        method: 'POST'
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORISED,
      statusCode: 401
    });

    expect(mocks.opsOtpChallengeUpdate).toHaveBeenCalledWith({
      where: { id: 'challenge_1' },
      data: {
        failedAttempts: 3,
        status: 'FAILED'
      }
    });
  });

  it('saveConfigDraft upserts only runtime overlay keys from contract', async () => {
    const { service, mocks } = createOpsServiceHarness();

    vi.spyOn(service, 'verifyEmailOtp').mockResolvedValue({ verified: true });
    vi.spyOn(service, 'validateConfigDraft').mockResolvedValue({
      valid: true,
      domain: 'payments',
      checkedKeys: ['RAZORPAY_KEY_ID', 'DATABASE_URL'],
      errors: [],
      warnings: [],
      requiresRestart: true
    });

    mocks.opsConfigSecretUpsert.mockResolvedValue({});

    const result = await service.saveConfigDraft({
      opsUserId: 'ops_1',
      domain: 'payments',
      values: {
        RAZORPAY_KEY_ID: 'rzp_live_abc',
        DATABASE_URL: 'postgres://should-not-be-managed'
      },
      challengeId: 'challenge_1',
      otpCode: '123456',
      requestIp: '127.0.0.1',
      requestPath: '/api/v1/ops/config/save',
      method: 'POST'
    });

    expect(mocks.opsConfigSecretUpsert).toHaveBeenCalledTimes(1);
    expect(result.savedKeys).toEqual(['RAZORPAY_KEY_ID']);
  });

  it('validateConfigDraft rejects bootstrap-only keys', async () => {
    const { service } = createOpsServiceHarness();

    const result = await service.validateConfigDraft({
      opsUserId: 'ops_1',
      requestIp: '127.0.0.1',
      requestPath: '/api/v1/ops/config/validate',
      method: 'POST',
      domain: 'core',
      values: {
        DATABASE_URL: 'postgres://should-not-be-managed'
      }
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'DATABASE_URL',
        code: 'BOOTSTRAP_KEY_NOT_DB_APPLICABLE'
      })
    ]));
  });

  it('createOpsInvite fails fast when notification queue send fails', async () => {
    const { service, mocks } = createOpsServiceHarness();

    mocks.opsUserInviteCreate.mockResolvedValue({ id: 'invite_1' });
    mocks.notificationsAdd.mockRejectedValue(new Error('queue-down'));

    await expect(
      service.createOpsInvite({
        createdByOpsUserId: 'ops_1',
        inviteEmail: 'ops@example.com',
        inviteName: 'Ops User',
        permissions: ['OPS_READ'],
        ipAllowlist: ['203.0.113.10/32'],
        setupBaseUrl: 'https://client.com',
        requestIp: '127.0.0.1',
        requestPath: '/api/v1/ops/invites',
        method: 'POST'
      })
    ).rejects.toThrow('queue-down');

    expect(mocks.opsUserInviteUpdate).not.toHaveBeenCalled();
  });

  it('cleanupExpiredInvites bootstraps system audit actor when invite creator missing', async () => {
    const { service, mocks } = createOpsServiceHarness();

    mocks.opsUserInviteFindMany.mockResolvedValue([
      {
        id: 'invite_1',
        inviteEmail: 'ops@example.com',
        createdByOpsUserId: null
      }
    ]);

    mocks.opsUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ops_system_1', email: 'ops-system@local.internal' });

    mocks.opsUserCreate.mockResolvedValue({ id: 'ops_system_1' });

    await service.cleanupExpiredInvites({
      requestIp: '127.0.0.1',
      requestPath: '/api/v1/ops/invites/cleanup-expired',
      method: 'POST'
    });

    expect(mocks.opsUserCreate).toHaveBeenCalled();
    expect(mocks.opsAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opsUserId: 'ops_system_1',
          actionType: 'INVITE_EXPIRED_CLEANED'
        })
      })
    );
  });

  it('createOpsInvite resolves concurrent ops-system actor creation race safely', async () => {
    const { service, mocks } = createOpsServiceHarness();

    mocks.opsUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ops_system_existing' });
    mocks.opsUserCreate.mockRejectedValueOnce(new Error('unique constraint violation'));
    mocks.opsUserInviteCreate.mockResolvedValueOnce({
      id: 'invite_1',
      inviteEmail: 'ops@example.com',
      inviteName: 'Ops User',
      inviteTokenHash: 'hash',
      setupBaseUrl: 'https://example.com',
      status: 'CREATED',
      permissions: ['OPS_READ'],
      ipAllowlist: ['127.0.0.1/32'],
      expiresAt: new Date(Date.now() + 60_000),
      createdByOpsUserId: null
    });
    mocks.opsUserInviteUpdate.mockResolvedValueOnce({
      id: 'invite_1',
      inviteEmail: 'ops@example.com',
      inviteName: 'Ops User',
      inviteTokenHash: 'hash',
      setupBaseUrl: 'https://example.com',
      status: 'EMAIL_SENT',
      permissions: ['OPS_READ'],
      ipAllowlist: ['127.0.0.1/32'],
      expiresAt: new Date(Date.now() + 60_000),
      createdByOpsUserId: null
    });

    await service.createOpsInvite({
      inviteEmail: 'ops@example.com',
      inviteName: 'Ops User',
      setupBaseUrl: 'https://example.com',
      permissions: ['OPS_READ'],
      ipAllowlist: ['127.0.0.1/32'],
      requestIp: '127.0.0.1',
      requestPath: '/api/v1/ops/invites',
      method: 'POST'
    });

    expect(mocks.opsAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opsUserId: 'ops_system_existing',
          actionType: 'INVITE_CREATED'
        })
      })
    );
  });

  it('withOpsAuditChainLock releases lock after successful execution', async () => {
    const { service, mocks } = createOpsServiceHarness();
    const maybeWithOpsAuditChainLock = Reflect.get(service as object, 'withOpsAuditChainLock');
    if (typeof maybeWithOpsAuditChainLock !== 'function') {
      throw new Error('withOpsAuditChainLock is not available');
    }
    const withOpsAuditChainLock = (
      maybeWithOpsAuditChainLock as (this: OpsService, fn: () => Promise<unknown>) => Promise<unknown>
    ).bind(service) as <T>(fn: () => Promise<T>) => Promise<T>;

    const result = await withOpsAuditChainLock(async () => 'ok');

    expect(result).toBe('ok');
    expect(mocks.redisSet).toHaveBeenCalled();
    expect(mocks.redisEval).toHaveBeenCalled();
  });

  it('withOpsAuditChainLock fails fast when lock cannot be acquired within timeout window', async () => {
    const { service, mocks } = createOpsServiceHarness();
    const maybeWithOpsAuditChainLock = Reflect.get(service as object, 'withOpsAuditChainLock');
    if (typeof maybeWithOpsAuditChainLock !== 'function') {
      throw new Error('withOpsAuditChainLock is not available');
    }
    const withOpsAuditChainLock = (
      maybeWithOpsAuditChainLock as (this: OpsService, fn: () => Promise<unknown>) => Promise<unknown>
    ).bind(service) as <T>(fn: () => Promise<T>) => Promise<T>;

    mocks.redisSet.mockResolvedValue(undefined as unknown as string);
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(2_001);

    await expect(withOpsAuditChainLock(async () => 'never')).rejects.toMatchObject({
      message: 'Timed out acquiring ops audit chain lock',
      statusCode: 503,
      code: 'INTERNAL_ERROR'
    });
    expect(mocks.redisEval).not.toHaveBeenCalled();
  });
});
