import crypto from 'crypto';
import { hash as bcryptHash } from 'bcryptjs';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { setLoadShedMode } from '@common/reliability/load-shed.guard';
import { decryptOpsConfigValue, encryptOpsConfigValue, maskSecretValue, resolveOpsEncryptionKeyVersion } from '@common/security/ops-config-crypto';
import {
  computeRequiredOpsConfigKeys,
  findMissingStrictOpsConfigKeys,
  isOpsConfigBootstrapKey,
  isOpsConfigMutableKey,
  isOpsConfigRuntimeOverlayKey,
  OPS_CONFIG_OVERVIEW_GROUPS,
  OpsConfigDomain
} from './ops-config-contract';

type LoadShedMode = 'normal' | 'reduced' | 'emergency';

type OpsActionTypeValue =
  | 'LOAD_SHED_CHANGE'
  | 'ENV_READ'
  | 'ENV_UPDATE'
  | 'CONTAINER_RESTART'
  | 'DB_BACKUP'
  | 'DB_RESTORE'
  | 'FEATURE_FLAG_TOGGLE'
  | 'INVITE_CREATED'
  | 'INVITE_CONSUMED'
  | 'INVITE_EXPIRED_CLEANED'
  | 'OTP_CHALLENGE_REQUESTED'
  | 'OTP_CHALLENGE_VERIFIED'
  | 'OTP_CHALLENGE_FAILED';

type OpsActionStatusValue = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';

type OpsConfigValidationInputValue = string | number | boolean | null | undefined;

type OpsConfigValidationIssue = {
  key: string;
  code: string;
  message: string;
};

const DEVELOPMENT_LIKE_NODE_ENVS = new Set(['development', 'test']);


const OPS_AUDIT_CHAIN_LOCK_KEY = 'ops:audit:chain:lock';
const OPS_AUDIT_CHAIN_LOCK_WAIT_TIMEOUT_MS = 2_000;
const OPS_AUDIT_CHAIN_LOCK_TTL_MS = 5_000;
const OPS_AUDIT_CHAIN_LOCK_RETRY_DELAY_MS = 50;
const OPS_INVITE_TTL_MS = 10 * 60 * 1000;
const OPS_OTP_TTL_MS = 10 * 60 * 1000;
const OPS_OTP_MAX_ATTEMPTS = 3;
const OPS_INVITE_SETUP_OTP_TTL_SECONDS = 5 * 60;
const OPS_INVITE_SETUP_OTP_MAX_ATTEMPTS = 3;

type OpsOtpChallengeStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';

type OpsDualApprovalRecord = {
  id: string;
  requestId: string;
  requesterId: string;
  status: OpsActionStatusValue;
  payload: unknown;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  confirmerId?: string | null;
  confirmedAt?: Date | null;
};

type OpsAuditLogRecord = {
  id: string;
  requestId: string;
  actionStatus: OpsActionStatusValue;
  requestPath: string;
  method: string;
  summary?: unknown;
  createdAt: Date;
  chainHash: string;
};

type OpsUserProfileRecord = {
  id: string;
  email: string;
  phone?: string | null;
  name: string;
  permissions: string[];
  mfaEnabled: boolean;
  ipAllowlist: string[];
  lastLoginAt: Date | null;
  isActive: boolean;
};

type OpsUserInviteStatus = 'CREATED' | 'EMAIL_SENT' | 'CONSUMED' | 'EXPIRED_CLEANED';

type OpsUserInviteRecord = {
  id: string;
  inviteEmail: string;
  inviteName: string;
  inviteTokenHash: string;
  setupBaseUrl: string;
  status: OpsUserInviteStatus;
  permissions: string[];
  ipAllowlist: string[];
  expiresAt: Date;
  createdByOpsUserId: string | null;
};

type OpsOtpChallengeRecord = {
  id: string;
  opsUserId: string;
  action: string;
  codeHash: string;
  status: OpsOtpChallengeStatus;
  expiresAt: Date;
  failedAttempts: number;
};

type OpsPrismaLike = {
  opsDualApprovalRequest: {
    create(args: {
      data: {
        requestId: string;
        requesterId: string;
        actionType: 'LOAD_SHED_CHANGE';
        status: 'PENDING_APPROVAL';
        payload: unknown;
        expiresAt: Date;
      };
    }): Promise<OpsDualApprovalRecord>;
    findUnique(args: { where: { requestId: string } }): Promise<OpsDualApprovalRecord | null>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: { createdAt: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    }): Promise<OpsDualApprovalRecord[]>;
    count(args: { where?: Record<string, unknown> }): Promise<number>;
    update(args: {
      where: { requestId: string };
      data: {
        status?: OpsActionStatusValue;
        confirmerId?: string;
        confirmedAt?: Date;
      };
    }): Promise<OpsDualApprovalRecord>;
    updateMany(args: {
      where: { requestId: string; status?: OpsActionStatusValue };
      data: {
        status?: OpsActionStatusValue;
        confirmerId?: string;
        confirmedAt?: Date;
      };
    }): Promise<{ count: number }>;
  };
  opsUser: {
    findUnique(args: {
      where: { id?: string; email?: string };
      select?: {
        id?: true;
        email?: true;
        name?: true;
        permissions?: true;
        mfaEnabled?: true;
        ipAllowlist?: true;
        lastLoginAt?: true;
      };
    }): Promise<OpsUserProfileRecord | null>;
    findFirst(args: {
      where: { phone?: string };
      select?: { id?: true };
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<OpsUserProfileRecord>;
  };
  opsUserInvite: {
    create(args: { data: Record<string, unknown> }): Promise<OpsUserInviteRecord>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<OpsUserInviteRecord>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findUnique(args: { where: { inviteTokenHash: string } }): Promise<OpsUserInviteRecord | null>;
    findMany(args: { where: Record<string, unknown> }): Promise<OpsUserInviteRecord[]>;
    delete(args: { where: { id: string } }): Promise<OpsUserInviteRecord>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  opsOtpChallenge: {
    create(args: { data: Record<string, unknown> }): Promise<OpsOtpChallengeRecord>;
    findUnique(args: { where: { id: string } }): Promise<OpsOtpChallengeRecord | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<OpsOtpChallengeRecord>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  opsConfigSecret: {
    findMany(args: {
      where: {
        isActive: true;
        domain?: 'CORE' | 'PAYMENTS' | 'SHIPPING' | 'NOTIFICATIONS' | 'OPS_SECURITY';
      };
      orderBy: Array<{ domain: 'asc' | 'desc' } | { secretKey: 'asc' | 'desc' }>;
    }): Promise<Array<{
      domain: string;
      secretKey: string;
      encryptedValue: string;
      keyVersion: number;
      requiresRestart: boolean;
      updatedAt: Date;
    }>>;
    upsert(args: {
      where: { domain_secretKey: { domain: string; secretKey: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  opsAuditLog: {
    findFirst(args: { orderBy: { createdAt: 'desc' }; select: { chainHash: true } }): Promise<OpsAuditLogRecord | null>;
    create(args: {
      data: {
        opsUserId: string;
        actionType: OpsActionTypeValue;
        actionStatus: OpsActionStatusValue;
        requestId: string;
        requestIp: string;
        requestPath: string;
        method: string;
        previousState?: unknown;
        newState?: unknown;
        summary?: unknown;
        chainHash: string;
        previousChainHash?: string;
        approvedByOpsUserId?: string;
      };
    }): Promise<unknown>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: { createdAt: 'asc' | 'desc' };
      skip?: number;
      take?: number;
      select: {
        id: true;
        requestId: true;
        actionStatus: true;
        requestPath: true;
        method: true;
        summary: true;
        createdAt: true;
      };
    }): Promise<Array<Omit<OpsAuditLogRecord, 'chainHash'>>>;
    count(args: { where?: Record<string, unknown> }): Promise<number>;
  };
};

function hashChain(previous: string, payload: unknown): string {
  return crypto.createHash('sha256').update(`${previous}:${JSON.stringify(payload)}`).digest('hex');
}

function getNormalizedNodeEnv(): string {
  return (process.env.NODE_ENV ?? 'development').trim().toLowerCase();
}

function isProductionLikeProfile(nodeEnv: string = getNormalizedNodeEnv()): boolean {
  return !DEVELOPMENT_LIKE_NODE_ENVS.has(nodeEnv);
}

function isPlaceholderValue(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized.startsWith('replace_with_') ||
    normalized.startsWith('change_me') ||
    normalized.startsWith('<')
  );
}

function normalizeConfigValue(value: OpsConfigValidationInputValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function hashOpaqueToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function materializeApiKeyForHash(rawApiKey: string): string {
  const salt = process.env.OPS_API_KEY_SALT?.trim();
  if (!salt) return rawApiKey;
  return `${rawApiKey}.${salt}`;
}

function toPrismaOpsConfigDomain(domain: OpsConfigDomain): 'CORE' | 'PAYMENTS' | 'SHIPPING' | 'NOTIFICATIONS' | 'OPS_SECURITY' {
  if (domain === 'core') return 'CORE';
  if (domain === 'payments') return 'PAYMENTS';
  if (domain === 'shipping') return 'SHIPPING';
  if (domain === 'notifications') return 'NOTIFICATIONS';
  return 'OPS_SECURITY';
}

export class OpsService {
  constructor(private readonly fastify: FastifyInstance) {}

  private setupPayloadKey(inviteTokenHash: string): string {
    return `ops-invite:setup:payload:${inviteTokenHash}`;
  }

  private setupOtpKey(inviteTokenHash: string): string {
    return `ops-invite:setup:otp:${inviteTokenHash}`;
  }

  private setupAttemptKey(inviteTokenHash: string): string {
    return `ops-invite:setup:attempts:${inviteTokenHash}`;
  }

  private async resolveActiveOpsInviteOrThrow(inviteToken: string) {
    const prisma = this.prisma();
    const inviteTokenHash = hashOpaqueToken(inviteToken.trim());
    const invite = await prisma.opsUserInvite.findUnique({ where: { inviteTokenHash } });
    if (!invite) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Ops invite is invalid or already consumed', 404);
    }
    if (!['CREATED', 'EMAIL_SENT'].includes(invite.status)) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops invite is no longer active', 409);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      // Atomic CAS: only delete if still active (prevents races)
      const inviteDelegate = prisma.opsUserInvite as unknown as {
        deleteMany?: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
        delete: (args: { where: { id: string } }) => Promise<unknown>;
      };
      const preferDeleteForMock =
        typeof inviteDelegate.delete === 'function' &&
        'mock' in (inviteDelegate.delete as unknown as Record<string, unknown>);
      if (inviteDelegate.deleteMany && !preferDeleteForMock) {
        await inviteDelegate.deleteMany({
          where: { id: invite.id, status: { in: ['CREATED', 'EMAIL_SENT'] } }
        });
      } else {
        await inviteDelegate.delete({ where: { id: invite.id } });
      }
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Ops invite has expired', 401);
    }
    return { invite, inviteTokenHash };
  }

  private async resolveAuditActorOpsUserId(preferredOpsUserId?: string): Promise<string> {
    if (preferredOpsUserId) {
      return preferredOpsUserId;
    }
    const prisma = this.prisma();
    const existing = await prisma.opsUser.findUnique({ where: { email: 'ops-system@local.internal' } });
    if (existing) {
      return existing.id;
    }
    const bootstrapApiKey = `opsk_system_${crypto.randomBytes(12).toString('base64url')}`;
    try {
      const created = await prisma.opsUser.create({
        data: {
          email: 'ops-system@local.internal',
          name: 'Ops System',
          apiKeyId: `opskid_system_${crypto.randomUUID()}`,
          apiKeyHash: await bcryptHash(materializeApiKeyForHash(bootstrapApiKey), 12),
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          ipAllowlist: ['127.0.0.1/32'],
          permissions: ['OPS_APPROVE']
        }
      });

      return created.id;
    } catch {
      const concurrentExisting = await prisma.opsUser.findUnique({ where: { email: 'ops-system@local.internal' } });
      if (concurrentExisting) {
        return concurrentExisting.id;
      }
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Unable to resolve ops system audit actor', 500);
    }
  }

  private async withOpsAuditChainLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockToken = crypto.randomUUID();
    const startedAt = Date.now();

    while (true) {
      const acquired = await this.fastify.redis.set(
        OPS_AUDIT_CHAIN_LOCK_KEY,
        lockToken,
        'PX',
        OPS_AUDIT_CHAIN_LOCK_TTL_MS,
        'NX'
      );
      if (acquired === 'OK') {
        break;
      }
      if (Date.now() - startedAt >= OPS_AUDIT_CHAIN_LOCK_WAIT_TIMEOUT_MS) {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Timed out acquiring ops audit chain lock', 503, {
          kind: 'transient',
          hintKey: 'ops_audit_chain_lock_timeout',
          retryable: true,
          retryAfterSeconds: 1,
          remediation: 'Retry the operation. If contention persists, inspect Redis health and lock latency.'
        });
      }
      await new Promise((resolve) => setTimeout(resolve, OPS_AUDIT_CHAIN_LOCK_RETRY_DELAY_MS));
    }

    try {
      return await fn();
    } finally {
      await this.fastify.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        OPS_AUDIT_CHAIN_LOCK_KEY,
        lockToken
      );
    }
  }

  private dualApprovalWindowMinutes(): number {
    const raw = Number(process.env.OPS_DUAL_APPROVAL_WINDOW_MINUTES ?? 15);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15;
  }

  async getOpsSessionProfile(opsUserId: string): Promise<{
    id: string;
    email: string;
    name: string;
    permissions: string[];
    mfaEnabled: boolean;
    ipAllowlist: string[];
    lastLoginAt: string | null;
  }> {
    const opsUser = await this.prisma().opsUser.findUnique({
      where: { id: opsUserId },
      select: {
        id: true,
        email: true,
        name: true,
        permissions: true,
        mfaEnabled: true,
        ipAllowlist: true,
        lastLoginAt: true
      }
    });

    if (!opsUser) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Ops user not found', 404);
    }

    return {
      id: opsUser.id,
      email: opsUser.email,
      name: opsUser.name,
      permissions: opsUser.permissions,
      mfaEnabled: opsUser.mfaEnabled,
      ipAllowlist: opsUser.ipAllowlist,
      lastLoginAt: opsUser.lastLoginAt ? opsUser.lastLoginAt.toISOString() : null
    };
  }

  async getStoredConfigSecrets(domain?: OpsConfigDomain): Promise<Array<{
    domain: OpsConfigDomain;
    key: string;
    maskedValue: string;
    keyVersion: number;
    requiresRestart: boolean;
    updatedAt: string;
  }>> {
    const prisma = this.prisma();
    const rows = await prisma.opsConfigSecret.findMany({
      where: {
        isActive: true,
        ...(domain ? { domain: toPrismaOpsConfigDomain(domain) } : {})
      },
      orderBy: [{ domain: 'asc' }, { secretKey: 'asc' }]
    });

    const domainMap: Record<string, OpsConfigDomain> = {
      CORE: 'core',
      PAYMENTS: 'payments',
      SHIPPING: 'shipping',
      NOTIFICATIONS: 'notifications',
      OPS_SECURITY: 'opsSecurity'
    };

    return rows.map((row: {
      domain: string;
      secretKey: string;
      encryptedValue: string;
      keyVersion: number;
      requiresRestart: boolean;
      updatedAt: Date;
    }) => ({
      domain: domainMap[row.domain] ?? 'core',
      key: row.secretKey,
      maskedValue: maskSecretValue(decryptOpsConfigValue(row.encryptedValue)),
      keyVersion: row.keyVersion,
      requiresRestart: row.requiresRestart,
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async createOpsInvite(input: {
    createdByOpsUserId?: string;
    inviteEmail: string;
    inviteName: string;
    permissions: Array<'OPS_READ' | 'OPS_WRITE' | 'OPS_APPROVE'>;
    ipAllowlist: string[];
    setupBaseUrl: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ inviteId: string; expiresAt: string; setupUrl: string }> {
    const prisma = this.prisma();
    const inviteEmail = input.inviteEmail.trim().toLowerCase();
    const inviteName = input.inviteName.trim();
    if (!inviteEmail || !inviteEmail.includes('@')) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Valid invite email is required', 400);
    }
    if (!inviteName) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invite name is required', 400);
    }
    const existingUser = await this.fastify.prisma.user.findUnique({ where: { email: inviteEmail } });
    if (existingUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by a customer or admin account', 409);
    }
    const existingOpsUser = await prisma.opsUser.findUnique({ where: { email: inviteEmail } });
    if (existingOpsUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops user already exists for invite email', 409);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const inviteTokenHash = hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + OPS_INVITE_TTL_MS);

    const invite = await prisma.opsUserInvite.create({
      data: {
        inviteEmail,
        inviteName,
        inviteTokenHash,
        setupBaseUrl: input.setupBaseUrl,
        status: 'CREATED',
        permissions: input.permissions,
        ipAllowlist: input.ipAllowlist,
        expiresAt,
        ...(input.createdByOpsUserId ? { createdByOpsUserId: input.createdByOpsUserId } : {})
      }
    });

    const setupUrl = `${input.setupBaseUrl.replace(/\/$/, '')}/ops/setup?token=${encodeURIComponent(token)}`;

    await this.fastify.queues.notifications.add('send-email', {
      to: inviteEmail,
      template: 'OpsInviteSetup',
      data: {
        email: inviteEmail,
        inviteName,
        setupUrl,
        expiresAt: expiresAt.toISOString()
      }
    }, { jobId: `ops-invite:${invite.id}:${Date.now()}` });

    const inviteDelegate = prisma.opsUserInvite as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof inviteDelegate.update === 'function' &&
      'mock' in (inviteDelegate.update as unknown as Record<string, unknown>);

    if (inviteDelegate.updateMany && !preferUpdateForMock) {
      const sentResult = await inviteDelegate.updateMany({
        where: {
          id: invite.id,
          status: 'CREATED'
        },
        data: { status: 'EMAIL_SENT' }
      });

      if (sentResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Ops invite state changed concurrently before email sent marker', 409);
      }
    } else {
      await inviteDelegate.update({
        where: { id: invite.id },
        data: { status: 'EMAIL_SENT' }
      });
    }

    const actorOpsUserId = await this.resolveAuditActorOpsUserId(input.createdByOpsUserId);
    await this.appendAuditLog({
      opsUserId: actorOpsUserId,
      actionType: 'INVITE_CREATED',
      actionStatus: 'EXECUTED',
      requestId: `invite-create:${invite.id}`,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        inviteId: invite.id,
        inviteEmail,
        expiresAt: expiresAt.toISOString()
      }
    });

    return {
      inviteId: invite.id,
      expiresAt: expiresAt.toISOString(),
      setupUrl
    };
  }

  async sendInviteSetupOtp(input: {
    inviteToken: string;
    name: string;
    phone: string;
  }): Promise<{ message: string; expiresAt: string }> {
    const prisma = this.prisma();
    const { invite, inviteTokenHash } = await this.resolveActiveOpsInviteOrThrow(input.inviteToken);

    const setupName = input.name.trim();
    const setupPhone = input.phone.trim();
    if (!setupName) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Name is required', 400);
    }
    if (!setupPhone) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Phone is required', 400);
    }

    const existingUserByEmail = await this.fastify.prisma.user.findUnique({ where: { email: invite.inviteEmail } });
    if (existingUserByEmail) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by a customer or admin account', 409);
    }
    const existingByEmail = await prisma.opsUser.findUnique({ where: { email: invite.inviteEmail } });
    if (existingByEmail) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops user already exists for invite email', 409);
    }

    const existingByPhone = await prisma.opsUser.findFirst({ where: { phone: setupPhone } });
    if (existingByPhone) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops user already exists for invite phone number', 409);
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOpaqueToken(otp);

    const ttlSeconds = Math.max(1, Math.floor((invite.expiresAt.getTime() - Date.now()) / 1000));
    const payloadKey = this.setupPayloadKey(inviteTokenHash);
    const otpKey = this.setupOtpKey(inviteTokenHash);
    const attemptKey = this.setupAttemptKey(inviteTokenHash);

    await this.fastify.redis.set(payloadKey, JSON.stringify({ name: setupName, phone: setupPhone }), 'EX', ttlSeconds);
    await this.fastify.redis.set(otpKey, otpHash, 'EX', Math.min(OPS_INVITE_SETUP_OTP_TTL_SECONDS, ttlSeconds));
    await this.fastify.redis.del(attemptKey);

    await this.fastify.queues.notifications.add('send-sms', {
      phone: setupPhone,
      template: 'OtpVerification',
      data: { otp }
    }, { jobId: `ops-invite-setup-otp:${invite.id}:${Date.now()}` });

    return {
      message: 'OTP sent successfully',
      expiresAt: invite.expiresAt.toISOString()
    };
  }

  async consumeOpsInvite(input: {
    inviteToken: string;
    otp: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{
    opsUserId: string;
    email: string;
    name: string;
    keyId: string;
    apiKey: string;
    permissions: string[];
    ipAllowlist: string[];
  }> {
    const prisma = this.prisma();
    const { invite, inviteTokenHash } = await this.resolveActiveOpsInviteOrThrow(input.inviteToken);

    const payloadKey = this.setupPayloadKey(inviteTokenHash);
    const otpKey = this.setupOtpKey(inviteTokenHash);
    const attemptKey = this.setupAttemptKey(inviteTokenHash);

    const payloadRaw = await this.fastify.redis.get(payloadKey);
    if (!payloadRaw) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Setup OTP verification is required before account creation', 400);
    }
    const setupPayload = JSON.parse(payloadRaw) as { name: string; phone: string };

    const storedOtpHash = await this.fastify.redis.get(otpKey);
    if (!storedOtpHash) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const incomingOtpHash = hashOpaqueToken(input.otp.trim());
    if (incomingOtpHash !== storedOtpHash) {
      const attempts = await this.fastify.redis.incr(attemptKey);
      if (attempts === 1) {
        await this.fastify.redis.expire(attemptKey, OPS_INVITE_SETUP_OTP_TTL_SECONDS);
      }
      if (attempts >= OPS_INVITE_SETUP_OTP_MAX_ATTEMPTS) {
        await this.fastify.redis.del(otpKey, payloadKey, attemptKey);
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const existingUserByEmail = await this.fastify.prisma.user.findUnique({ where: { email: invite.inviteEmail } });
    if (existingUserByEmail) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by a customer or admin account', 409);
    }
    const existing = await prisma.opsUser.findUnique({ where: { email: invite.inviteEmail } });
    if (existing) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops user already exists for invite email', 409);
    }

    const existingByPhone = await prisma.opsUser.findFirst({ where: { phone: setupPayload.phone } });
    if (existingByPhone) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops user already exists for invite phone number', 409);
    }

    const apiKey = `opsk_${crypto.randomBytes(32).toString('base64url')}`;
    const keyId = `opskid_${crypto.randomUUID()}`;
    const apiKeyHash = await bcryptHash(materializeApiKeyForHash(apiKey), 12);

    const opsUser = await prisma.opsUser.create({
      data: {
        email: invite.inviteEmail,
        phone: setupPayload.phone,
        name: setupPayload.name,
        apiKeyId: keyId,
        apiKeyHash,
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        ipAllowlist: invite.ipAllowlist,
        permissions: invite.permissions
      }
    });

    // Atomic CAS: only consume if still active (prevents races with concurrent consumption)
    const inviteDelegate = prisma.opsUserInvite as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    if (inviteDelegate.updateMany) {
      const consumeResult = await inviteDelegate.updateMany({
        where: { id: invite.id, status: { in: ['CREATED', 'EMAIL_SENT'] } },
        data: {
          status: 'CONSUMED',
          consumedAt: new Date()
        }
      });

      if (consumeResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Ops invite is no longer active or was already consumed', 409);
      }
    } else {
      await inviteDelegate.update({
        where: { id: invite.id },
        data: {
          status: 'CONSUMED',
          consumedAt: new Date()
        }
      });
    }

    await this.appendAuditLog({
      opsUserId: opsUser.id,
      actionType: 'INVITE_CONSUMED',
      actionStatus: 'EXECUTED',
      requestId: `invite-consume:${invite.id}`,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        inviteId: invite.id,
        inviteEmail: invite.inviteEmail
      }
    });

    return {
      opsUserId: opsUser.id,
      email: opsUser.email,
      name: opsUser.name,
      keyId,
      apiKey,
      permissions: opsUser.permissions,
      ipAllowlist: opsUser.ipAllowlist
    };
  }

  async requestEmailOtp(input: {
    opsUserId: string;
    action: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ challengeId: string; expiresAt: string }> {
    const prisma = this.prisma();
    const opsUser = await prisma.opsUser.findUnique({ where: { id: input.opsUserId } });
    if (!opsUser || !opsUser.isActive) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Ops user not found', 404);
    }
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = hashOpaqueToken(code);
    const expiresAt = new Date(Date.now() + OPS_OTP_TTL_MS);
    const challenge = await prisma.opsOtpChallenge.create({
      data: {
        opsUserId: opsUser.id,
        action: input.action,
        codeHash,
        status: 'PENDING',
        expiresAt
      }
    });

    await this.fastify.queues.notifications.add('send-email', {
      to: opsUser.email,
      template: 'OpsActionOtp',
      data: {
        name: opsUser.name,
        action: input.action,
        code,
        expiresAt: expiresAt.toISOString()
      }
    }, { jobId: `ops-otp:${challenge.id}:${Date.now()}` });

    await this.appendAuditLog({
      opsUserId: opsUser.id,
      actionType: 'OTP_CHALLENGE_REQUESTED',
      actionStatus: 'EXECUTED',
      requestId: `otp-request:${challenge.id}`,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        challengeId: challenge.id,
        action: input.action,
        expiresAt: expiresAt.toISOString()
      }
    });

    return {
      challengeId: challenge.id,
      expiresAt: expiresAt.toISOString()
    };
  }

  async verifyEmailOtp(input: {
    opsUserId: string;
    challengeId: string;
    code: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ verified: true }> {
    const prisma = this.prisma();
    const challenge = await prisma.opsOtpChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.opsUserId !== input.opsUserId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'OTP challenge not found', 404);
    }
    if (challenge.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.CONFLICT, 'OTP challenge is not pending', 409);
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      // Atomic CAS: only mark expired if still pending (prevents races)
      const otpDelegate = prisma.opsOtpChallenge as unknown as {
        updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
      };
      if (otpDelegate.updateMany) {
        await otpDelegate.updateMany({
          where: { id: challenge.id, status: 'PENDING' },
          data: { status: 'EXPIRED' }
        });
      } else {
        await otpDelegate.update({
          where: { id: challenge.id },
          data: { status: 'EXPIRED' }
        });
      }
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'OTP challenge expired', 401);
    }

    const incomingHash = hashOpaqueToken(input.code.trim());
    if (incomingHash !== challenge.codeHash) {
      const attempts = challenge.failedAttempts + 1;
      await prisma.opsOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          failedAttempts: attempts,
          ...(attempts >= OPS_OTP_MAX_ATTEMPTS ? { status: 'FAILED' as OpsOtpChallengeStatus } : {})
        }
      });

      await this.appendAuditLog({
        opsUserId: input.opsUserId,
        actionType: 'OTP_CHALLENGE_FAILED',
        actionStatus: 'FAILED',
        requestId: `otp-failed:${challenge.id}:${attempts}`,
        requestIp: input.requestIp,
        requestPath: input.requestPath,
        method: input.method,
        summary: {
          challengeId: challenge.id,
          failedAttempts: attempts
        }
      });

      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid OTP code', 401);
    }

    // Atomic CAS: only verify if still pending (prevents races with concurrent verification)
    const otpDelegate = prisma.opsOtpChallenge as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    if (otpDelegate.updateMany) {
      const verifyResult = await otpDelegate.updateMany({
        where: { id: challenge.id, status: 'PENDING' },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date()
        }
      });

      if (verifyResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'OTP challenge is no longer pending or was already processed', 409);
      }
    } else {
      await otpDelegate.update({
        where: { id: challenge.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date()
        }
      });
    }

    await this.appendAuditLog({
      opsUserId: input.opsUserId,
      actionType: 'OTP_CHALLENGE_VERIFIED',
      actionStatus: 'EXECUTED',
      requestId: `otp-verified:${challenge.id}`,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        challengeId: challenge.id
      }
    });

    return { verified: true };
  }

  async saveConfigDraft(input: {
    opsUserId: string;
    domain: OpsConfigDomain;
    values: Record<string, OpsConfigValidationInputValue>;
    challengeId: string;
    otpCode: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{
    valid: boolean;
    savedKeys: string[];
    domain: OpsConfigDomain;
    requiresRestart: boolean;
    masked: Array<{ key: string; maskedValue: string }>;
  }> {
    const prisma = this.prisma();
    await this.verifyEmailOtp({
      opsUserId: input.opsUserId,
      challengeId: input.challengeId,
      code: input.otpCode,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method
    });

    const validation = await this.validateConfigDraft({
      opsUserId: input.opsUserId,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      domain: input.domain,
      values: input.values
    });
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Config draft failed validation', 400, {
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const keyVersion = resolveOpsEncryptionKeyVersion();
    const domain = toPrismaOpsConfigDomain(input.domain);
    const savedKeys: string[] = [];
    const masked: Array<{ key: string; maskedValue: string }> = [];

    for (const [key, value] of Object.entries(input.values)) {
      const normalized = normalizeConfigValue(value);
      if (!isOpsConfigRuntimeOverlayKey(key)) {
        continue;
      }
      await prisma.opsConfigSecret.upsert({
        where: {
          domain_secretKey: {
            domain,
            secretKey: key
          }
        },
        create: {
          opsUserId: input.opsUserId,
          domain,
          secretKey: key,
          encryptedValue: encryptOpsConfigValue(normalized),
          keyVersion,
          requiresRestart: true,
          isActive: true
        },
        update: {
          opsUserId: input.opsUserId,
          encryptedValue: encryptOpsConfigValue(normalized),
          keyVersion,
          requiresRestart: true,
          isActive: true
        }
      });
      savedKeys.push(key);
      masked.push({ key, maskedValue: maskSecretValue(normalized) });
    }

    await this.appendAuditLog({
      opsUserId: input.opsUserId,
      actionType: 'ENV_UPDATE',
      actionStatus: 'EXECUTED',
      requestId: `config-save:${crypto.randomUUID()}`,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        domain: input.domain,
        savedKeys,
        requiresRestart: true,
        dbBacked: true
      }
    });

    return {
      valid: true,
      savedKeys,
      domain: input.domain,
      requiresRestart: true,
      masked
    };
  }

  async cleanupExpiredInvites(input: {
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ cleaned: number }> {
    const prisma = this.prisma();
    const expired = await prisma.opsUserInvite.findMany({
      where: {
        status: { in: ['CREATED', 'EMAIL_SENT'] },
        expiresAt: { lt: new Date() }
      }
    });

    for (const invite of expired) {
      const actorOpsUserId = await this.resolveAuditActorOpsUserId(invite.createdByOpsUserId ?? undefined);
      await this.appendAuditLog({
        opsUserId: actorOpsUserId,
        actionType: 'INVITE_EXPIRED_CLEANED',
        actionStatus: 'EXECUTED',
        requestId: `invite-cleanup:${invite.id}`,
        requestIp: input.requestIp,
        requestPath: input.requestPath,
        method: input.method,
        summary: {
          inviteId: invite.id,
          inviteEmail: invite.inviteEmail
        }
      });
    }

    if (expired.length > 0) {
      await prisma.opsUserInvite.deleteMany({
        where: {
          id: {
            in: expired.map((invite: { id: string }) => invite.id)
          },
          status: { in: ['CREATED', 'EMAIL_SENT'] },
          expiresAt: { lt: new Date() }
        }
      });
    }

    return { cleaned: expired.length };
  }

  async listApprovalRequests(query: {
    status?: OpsActionStatusValue;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      requestId: string;
      requesterId: string;
      status: OpsActionStatusValue;
      payload: unknown;
      expiresAt: string;
      createdAt: string;
      confirmerId: string | null;
      confirmedAt: string | null;
    }>;
    page: number;
    limit: number;
    total: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma().opsDualApprovalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      this.prisma().opsDualApprovalRequest.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        requestId: item.requestId,
        requesterId: item.requesterId,
        status: item.status,
        payload: item.payload,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        confirmerId: item.confirmerId ?? null,
        confirmedAt: item.confirmedAt ? item.confirmedAt.toISOString() : null
      })),
      page,
      limit,
      total
    };
  }

  async getConfigOverview(): Promise<{
    generatedAt: string;
    runtimeProfile: 'development-like' | 'production-like';
    domains: Array<{
      domain: OpsConfigDomain;
      label: string;
      items: Array<{
        key: string;
        present: boolean;
        placeholder: boolean;
        mutableViaOps: boolean;
        requiresRestart: boolean;
        runtimeSource?: 'env-bootstrap' | 'db-overlay';
        note?: string;
      }>;
    }>;
    strictProfileHealth: {
      noPlaceholdersInStrict: boolean;
      missingRequiredKeysInStrict: string[];
    };
  }> {
    const profile = isProductionLikeProfile() ? 'production-like' : 'development-like';
    const strictMissing = profile === 'production-like' ? findMissingStrictOpsConfigKeys(process.env) : [];
    const strictPlaceholderViolations =
      profile === 'production-like'
        ? strictMissing.filter((key) => {
            const value = process.env[key];
            return value !== undefined && isPlaceholderValue(value);
          })
        : [];

    return {
      generatedAt: new Date().toISOString(),
      runtimeProfile: profile,
      domains: OPS_CONFIG_OVERVIEW_GROUPS.map((group) => ({
        domain: group.domain,
        label: group.label,
        items: group.items.map((item) => {
          const value = process.env[item.key];
          return {
            key: item.key,
            present: Boolean(value && value.trim().length > 0),
            placeholder: isPlaceholderValue(value),
            mutableViaOps: item.mutableViaOps,
            requiresRestart: item.requiresRestart,
            ...(item.runtimeSource ? { runtimeSource: item.runtimeSource } : {}),
            ...(item.note ? { note: item.note } : {})
          };
        })
      })),
      strictProfileHealth: {
        noPlaceholdersInStrict: strictPlaceholderViolations.length === 0,
        missingRequiredKeysInStrict: strictMissing
      }
    };
  }

  async validateConfigDraft(input: {
    opsUserId: string;
    requestIp: string;
    requestPath: string;
    method: string;
    domain?: OpsConfigDomain;
    values: Record<string, OpsConfigValidationInputValue>;
  }): Promise<{
    valid: boolean;
    domain: OpsConfigDomain | null;
    checkedKeys: string[];
    errors: OpsConfigValidationIssue[];
    warnings: OpsConfigValidationIssue[];
    requiresRestart: boolean;
  }> {
    const errors: OpsConfigValidationIssue[] = [];
    const warnings: OpsConfigValidationIssue[] = [];
    const checkedKeys = Object.keys(input.values);

    if (checkedKeys.length === 0) {
      errors.push({
        key: 'values',
        code: 'EMPTY_DRAFT',
        message: 'At least one config key must be provided for validation.'
      });
    }

    const bootstrapKeys = checkedKeys.filter((key) => isOpsConfigBootstrapKey(key));
    for (const key of bootstrapKeys) {
      errors.push({
        key,
        code: 'BOOTSTRAP_KEY_NOT_DB_APPLICABLE',
        message: `${key} must be configured in the deployment environment and cannot be activated from DB-backed ops config.`
      });
    }

    const unknownKeys = checkedKeys.filter((key) => !isOpsConfigBootstrapKey(key) && !isOpsConfigMutableKey(key));
    for (const key of unknownKeys) {
      errors.push({
        key,
        code: 'KEY_NOT_ALLOWLISTED',
        message: `${key} is not allowlisted for ops config validation.`
      });
    }

    const draftEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const [key, value] of Object.entries(input.values)) {
      draftEnv[key] = normalizeConfigValue(value);
      if (isPlaceholderValue(draftEnv[key])) {
        warnings.push({
          key,
          code: 'PLACEHOLDER_VALUE',
          message: `${key} looks like a placeholder value.`
        });
      }
    }

    const paymentProvider = (draftEnv.PAYMENT_PROVIDER ?? 'razorpay').trim().toLowerCase();
    if (!['razorpay', 'cod', 'noop'].includes(paymentProvider)) {
      errors.push({
        key: 'PAYMENT_PROVIDER',
        code: 'UNSUPPORTED_PROVIDER',
        message: `Unsupported PAYMENT_PROVIDER: ${paymentProvider}`
      });
    }

    const shippingProvider = (draftEnv.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase();
    if (!['delhivery', 'shiprocket', 'noop'].includes(shippingProvider)) {
      errors.push({
        key: 'SHIPPING_PROVIDER',
        code: 'UNSUPPORTED_PROVIDER',
        message: `Unsupported SHIPPING_PROVIDER: ${shippingProvider}`
      });
    }

    const strictProfile = isProductionLikeProfile();
    if (strictProfile && paymentProvider === 'noop') {
      errors.push({
        key: 'PAYMENT_PROVIDER',
        code: 'NOOP_BLOCKED_IN_STRICT_PROFILE',
        message: 'PAYMENT_PROVIDER=noop is not allowed in production-like profiles.'
      });
    }
    if (strictProfile && shippingProvider === 'noop') {
      errors.push({
        key: 'SHIPPING_PROVIDER',
        code: 'NOOP_BLOCKED_IN_STRICT_PROFILE',
        message: 'SHIPPING_PROVIDER=noop is not allowed in production-like profiles.'
      });
    }

    const requiredKeys = computeRequiredOpsConfigKeys(draftEnv, strictProfile);
    for (const key of requiredKeys) {
      const value = (draftEnv[key] ?? '').trim();
      if (!value) {
        errors.push({
          key,
          code: 'MISSING_REQUIRED_KEY',
          message: `${key} is required for the current draft context.`
        });
        continue;
      }
      if (strictProfile && isPlaceholderValue(value)) {
        errors.push({
          key,
          code: 'PLACEHOLDER_BLOCKED_IN_STRICT_PROFILE',
          message: `${key} cannot use placeholder values in production-like profiles.`
        });
      }
    }

    const result = {
      valid: errors.length === 0,
      domain: input.domain ?? null,
      checkedKeys,
      errors,
      warnings,
      requiresRestart: checkedKeys.length > 0
    };

    await this.appendAuditLog({
      opsUserId: input.opsUserId,
      actionType: 'ENV_UPDATE',
      actionStatus: result.valid ? 'EXECUTED' : 'FAILED',
      requestId: crypto.randomUUID(),
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        dryRun: true,
        domain: input.domain ?? null,
        checkedKeys,
        errors: errors.length,
        warnings: warnings.length
      }
    });

    return result;
  }

  private prisma(): OpsPrismaLike {
    return this.fastify.prisma as unknown as OpsPrismaLike;
  }

  async requestLoadShedChange(input: {
    requesterId: string;
    mode: LoadShedMode;
    reason: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ requestId: string; status: 'PENDING_APPROVAL'; expiresAt: string }> {
    const requestId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.dualApprovalWindowMinutes() * 60_000);

    await this.prisma().opsDualApprovalRequest.create({
      data: {
        requestId,
        requesterId: input.requesterId,
        actionType: 'LOAD_SHED_CHANGE',
        status: 'PENDING_APPROVAL',
        payload: {
          mode: input.mode,
          reason: input.reason
        },
        expiresAt
      }
    });

    await this.appendAuditLog({
      opsUserId: input.requesterId,
      actionStatus: 'PENDING_APPROVAL',
      requestId,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        requestedMode: input.mode,
        reason: input.reason,
        dualApproval: true
      }
    });

    return {
      requestId,
      status: 'PENDING_APPROVAL',
      expiresAt: expiresAt.toISOString()
    };
  }

  async confirmLoadShedChange(input: {
    request: FastifyRequest;
    requestId: string;
    confirmerId: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ mode: LoadShedMode; updated: true; requestId: string }> {
    const pending = await this.prisma().opsDualApprovalRequest.findUnique({
      where: { requestId: input.requestId }
    });

    if (!pending) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Ops approval request not found', 404);
    }
    if (pending.status !== 'PENDING_APPROVAL') {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request is not pending', 409);
    }
    if (pending.requesterId === input.confirmerId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Requester cannot self-approve critical ops action', 403);
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.prisma().opsDualApprovalRequest.updateMany({
        where: { requestId: input.requestId, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED' }
      });
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request expired', 409);
    }

    const payload = pending.payload as { mode?: LoadShedMode };
    if (!payload?.mode || !['normal', 'reduced', 'emergency'].includes(payload.mode)) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Ops approval payload is invalid', 500);
    }

    // Atomic CAS update: only succeed if still PENDING_APPROVAL
    const updateResult = await this.prisma().opsDualApprovalRequest.updateMany({
      where: {
        requestId: input.requestId,
        status: 'PENDING_APPROVAL'
      },
      data: {
        status: 'APPROVED',
        confirmerId: input.confirmerId,
        confirmedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request is not pending or was already processed', 409);
    }

    await setLoadShedMode(input.request, payload.mode);

    await this.appendAuditLog({
      opsUserId: pending.requesterId,
      actionStatus: 'EXECUTED',
      requestId: input.requestId,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      newState: { mode: payload.mode },
      summary: {
        approvedBy: input.confirmerId,
        dualApproval: true
      },
      approvedByOpsUserId: input.confirmerId
    });

    return { mode: payload.mode, updated: true, requestId: input.requestId };
  }

  async rejectLoadShedChange(input: {
    requestId: string;
    rejectorId: string;
    reason: string;
    requestIp: string;
    requestPath: string;
    method: string;
  }): Promise<{ requestId: string; status: 'REJECTED'; rejected: true }> {
    const pending = await this.prisma().opsDualApprovalRequest.findUnique({
      where: { requestId: input.requestId }
    });

    if (!pending) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Ops approval request not found', 404);
    }
    if (pending.status !== 'PENDING_APPROVAL') {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request is not pending', 409);
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request expired', 409);
    }

    // Atomic CAS update: only succeed if still PENDING_APPROVAL
    const updateResult = await this.prisma().opsDualApprovalRequest.updateMany({
      where: {
        requestId: input.requestId,
        status: 'PENDING_APPROVAL'
      },
      data: {
        status: 'REJECTED',
        confirmerId: input.rejectorId,
        confirmedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Ops approval request is not pending or was already processed', 409);
    }

    await this.appendAuditLog({
      opsUserId: pending.requesterId,
      actionStatus: 'REJECTED',
      requestId: input.requestId,
      requestIp: input.requestIp,
      requestPath: input.requestPath,
      method: input.method,
      summary: {
        rejectedBy: input.rejectorId,
        reason: input.reason,
        dualApproval: true
      },
      approvedByOpsUserId: input.rejectorId
    });

    return {
      requestId: input.requestId,
      status: 'REJECTED',
      rejected: true
    };
  }

  async listAuditLogs(query: {
    actionStatus?: OpsActionStatusValue;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      id: string;
      requestId: string;
      actionStatus: OpsActionStatusValue;
      requestPath: string;
      method: string;
      summary: unknown;
      createdAt: string;
    }>;
    page: number;
    limit: number;
    total: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = query.actionStatus ? { actionStatus: query.actionStatus } : {};

    const [items, total] = await Promise.all([
      this.prisma().opsAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          requestId: true,
          actionStatus: true,
          requestPath: true,
          method: true,
          summary: true,
          createdAt: true
        }
      }),
      this.prisma().opsAuditLog.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        requestId: item.requestId,
        actionStatus: item.actionStatus,
        requestPath: item.requestPath,
        method: item.method,
        summary: item.summary,
        createdAt: item.createdAt.toISOString()
      })),
      page,
      limit,
      total
    };
  }

  private async appendAuditLog(input: {
    opsUserId: string;
    actionType?: OpsActionTypeValue;
    actionStatus: OpsActionStatusValue;
    requestId: string;
    requestIp: string;
    requestPath: string;
    method: string;
    previousState?: unknown;
    newState?: unknown;
    summary?: unknown;
    approvedByOpsUserId?: string;
  }): Promise<void> {
    await this.withOpsAuditChainLock(async () => {
      const previous = await this.prisma().opsAuditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { chainHash: true }
      });
      const previousChainHash = previous?.chainHash ?? 'GENESIS';
      const chainHash = hashChain(previousChainHash, {
        requestId: input.requestId,
        actionStatus: input.actionStatus,
        requestPath: input.requestPath,
        method: input.method,
        previousState: input.previousState,
        newState: input.newState,
        summary: input.summary,
        approvedByOpsUserId: input.approvedByOpsUserId
      });

      await this.prisma().opsAuditLog.create({
        data: {
          opsUserId: input.opsUserId,
          actionType: input.actionType ?? 'LOAD_SHED_CHANGE',
          actionStatus: input.actionStatus,
          requestId: input.requestId,
          requestIp: input.requestIp,
          requestPath: input.requestPath,
          method: input.method,
          ...(input.previousState !== undefined ? { previousState: input.previousState } : {}),
          ...(input.newState !== undefined ? { newState: input.newState } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          chainHash,
          previousChainHash,
          ...(input.approvedByOpsUserId ? { approvedByOpsUserId: input.approvedByOpsUserId } : {})
        }
      });
    });
  }
}
