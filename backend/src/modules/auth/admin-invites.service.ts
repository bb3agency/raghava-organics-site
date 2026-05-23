import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { AdminPermission, MERCHANT_DEFAULT_PERMISSIONS } from '@common/auth/admin-permissions';
import { sendNotificationFailureAlert } from '@modules/notifications/notification-failure-alert';

const ADMIN_INVITE_TTL_MS = 10 * 60 * 1000;
const ADMIN_SETUP_OTP_TTL_SECONDS = 5 * 60;
const ADMIN_SETUP_OTP_MAX_ATTEMPTS = 3;
const MERCHANT_INVITE_ALLOWED_PERMISSIONS = new Set<AdminPermission>([
  ...MERCHANT_DEFAULT_PERMISSIONS,
  'orders:refund',
  'analytics:replay'
]);

function hashOpaqueToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeInvitePermissions(permissions: string[]): AdminPermission[] {
  const unique = [...new Set(permissions)];
  for (const p of unique) {
    if (!MERCHANT_INVITE_ALLOWED_PERMISSIONS.has(p as AdminPermission)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Permission is not allowed for merchant admin invite: ${p}`, 400);
    }
  }
  return unique as AdminPermission[];
}

function splitInviteName(inviteName: string): { firstName: string; lastName: string } {
  const parts = inviteName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Merchant';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Admin';
  return { firstName, lastName };
}

export class AdminInvitesService {
  constructor(private readonly fastify: FastifyInstance) {}

  private setupPayloadKey(inviteTokenHash: string): string {
    return `admin-invite:setup:payload:${inviteTokenHash}`;
  }

  private setupOtpKey(inviteTokenHash: string): string {
    return `admin-invite:setup:otp:${inviteTokenHash}`;
  }

  private setupAttemptKey(inviteTokenHash: string): string {
    return `admin-invite:setup:attempts:${inviteTokenHash}`;
  }

  private async resolveActiveInviteOrThrow(inviteToken: string) {
    const inviteTokenHash = hashOpaqueToken(inviteToken.trim());
    const invite = await this.fastify.prisma.adminUserInvite.findUnique({ where: { inviteTokenHash } });
    if (!invite) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Admin invite is invalid or already consumed', 404);
    }
    if (!['CREATED', 'EMAIL_SENT'].includes(invite.status)) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Admin invite is no longer active', 409);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      // Atomic CAS: only mark expired if still active (prevents races).
      // updateMany preserves audit trail; hard-delete would erase history.
      await this.fastify.prisma.adminUserInvite.updateMany({
        where: { id: invite.id, status: { in: ['CREATED', 'EMAIL_SENT'] } },
        data: { status: 'EXPIRED_CLEANED' }
      });
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Admin invite has expired', 401);
    }
    return { invite, inviteTokenHash };
  }

  async createAdminInvite(input: {
    createdByOpsUserId?: string;
    inviteEmail: string;
    inviteName: string;
    permissions: string[];
    setupBaseUrl: string;
  }): Promise<{ inviteId: string; expiresAt: string; setupUrl: string; permissions: string[] }> {
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
      throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for invite email', 409);
    }
    const existingOpsUser = await this.fastify.prisma.opsUser.findUnique({ where: { email: inviteEmail } });
    if (existingOpsUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by an ops account', 409);
    }
    const existingActiveInvite = await this.fastify.prisma.adminUserInvite.findFirst({
      where: { inviteEmail, status: { in: ['CREATED', 'EMAIL_SENT'] } }
    });
    if (existingActiveInvite) {
      throw new AppError(ERROR_CODES.CONFLICT, 'An active admin invite already exists for this email', 409);
    }

    const permissions = normalizeInvitePermissions(input.permissions);
    const token = crypto.randomBytes(32).toString('base64url');
    const inviteTokenHash = hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + ADMIN_INVITE_TTL_MS);

    const invite = await this.fastify.prisma.adminUserInvite.create({
      data: {
        inviteEmail,
        inviteName,
        inviteTokenHash,
        setupBaseUrl: input.setupBaseUrl,
        status: 'CREATED',
        permissions,
        expiresAt,
        ...(input.createdByOpsUserId ? { createdByOpsUserId: input.createdByOpsUserId } : {})
      }
    });

    const setupUrl = `${input.setupBaseUrl.replace(/\/$/, '')}/admin/setup?token=${encodeURIComponent(token)}`;

    const inviteJobId = `admin-invite:${invite.id}:${Date.now()}`;
    try {
      await this.fastify.queues.notifications.add('send-email', {
        to: inviteEmail,
        template: 'AdminInviteSetup',
        data: {
          email: inviteEmail,
          inviteName,
          setupUrl,
          expiresAt: expiresAt.toISOString()
        }
      }, { jobId: inviteJobId });
    } catch (error) {
      await sendNotificationFailureAlert({
        prisma: this.fastify.prisma,
        template: 'AdminInviteSetup',
        channel: 'EMAIL',
        recipient: inviteEmail,
        errorMessage: error instanceof Error ? error.message : 'Unable to enqueue admin invite email',
        failureStage: 'QUEUE_ENQUEUE',
        queueName: 'notifications',
        jobName: 'send-email',
        jobId: inviteJobId
      });
      throw error;
    }

    const sentResult = await this.fastify.prisma.adminUserInvite.updateMany({
      where: { id: invite.id, status: 'CREATED' },
      data: { status: 'EMAIL_SENT' }
    });
    if (sentResult.count === 0) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Admin invite state changed concurrently before email sent marker', 409);
    }

    return {
      inviteId: invite.id,
      expiresAt: expiresAt.toISOString(),
      setupUrl,
      permissions
    };
  }

  async consumeAdminInvite(input: {
    inviteToken: string;
    otp: string;
  }): Promise<{ adminUserId: string; email: string; name: string; permissions: string[] }> {
    const { invite, inviteTokenHash } = await this.resolveActiveInviteOrThrow(input.inviteToken);

    const payloadKey = this.setupPayloadKey(inviteTokenHash);
    const otpKey = this.setupOtpKey(inviteTokenHash);
    const attemptKey = this.setupAttemptKey(inviteTokenHash);

    const payloadRaw = await this.fastify.redis.get(payloadKey);
    if (!payloadRaw) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Setup OTP verification is required before account creation', 400);
    }
    const setupPayload = JSON.parse(payloadRaw) as { name: string; phone: string | null; passwordHash: string };

    const storedOtpHash = await this.fastify.redis.get(otpKey);
    if (!storedOtpHash) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const incomingOtpHash = hashOpaqueToken(input.otp.trim());
    if (incomingOtpHash !== storedOtpHash) {
      const attempts = await this.fastify.redis.incr(attemptKey);
      if (attempts === 1) {
        await this.fastify.redis.expire(attemptKey, ADMIN_SETUP_OTP_TTL_SECONDS);
      }
      if (attempts >= ADMIN_SETUP_OTP_MAX_ATTEMPTS) {
        await this.fastify.redis.del(otpKey, payloadKey, attemptKey);
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const existingUser = await this.fastify.prisma.user.findUnique({ where: { email: invite.inviteEmail } });
    if (existingUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for invite email', 409);
    }
    const existingOpsUser = await this.fastify.prisma.opsUser.findUnique({ where: { email: invite.inviteEmail } });
    if (existingOpsUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by an ops account', 409);
    }

    if (setupPayload.phone) {
      const existingPhone = await this.fastify.prisma.user.findFirst({ where: { phone: setupPayload.phone } });
      if (existingPhone) {
        throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for invite phone number', 409);
      }
    }

    const displayName = setupPayload.name?.trim() || invite.inviteName;
    const { firstName, lastName } = splitInviteName(displayName);
    const permissions = normalizeInvitePermissions(invite.permissions);

    const user = await this.fastify.prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          email: invite.inviteEmail,
          phone: setupPayload.phone ?? null,
          passwordHash: setupPayload.passwordHash,
          firstName,
          lastName,
          role: Role.ADMIN,
          isVerified: true
        }
      });

      await tx.adminPermissionGrant.createMany({
        data: permissions.map((permission) => ({
          userId: admin.id,
          permission
        })),
        skipDuplicates: true
      });

      // Atomic CAS: only consume if still active (prevents races with concurrent consumption)
      const consumeResult = await tx.adminUserInvite.updateMany({
        where: { id: invite.id, status: { in: ['CREATED', 'EMAIL_SENT'] } },
        data: {
          status: 'CONSUMED',
          consumedAt: new Date()
        }
      });
      if (consumeResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Admin invite is no longer active or was already consumed', 409);
      }

      return admin;
    });

    await this.fastify.redis.del(otpKey, payloadKey, attemptKey);

    return {
      adminUserId: user.id,
      email: user.email ?? invite.inviteEmail,
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || invite.inviteName,
      permissions
    };
  }

  async sendSetupOtp(input: {
    inviteToken: string;
    name: string;
    password: string;
    phone?: string;
  }): Promise<{ message: string; expiresAt: string }> {
    const { invite, inviteTokenHash } = await this.resolveActiveInviteOrThrow(input.inviteToken);
    if (input.password.length < 8) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Password must be at least 8 characters', 400);
    }
    const setupName = input.name.trim();
    if (!setupName) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Name is required', 400);
    }
    const setupPhone = input.phone?.trim() || null;

    const existingUser = await this.fastify.prisma.user.findUnique({ where: { email: invite.inviteEmail } });
    if (existingUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for invite email', 409);
    }
    const existingOpsUser = await this.fastify.prisma.opsUser.findUnique({ where: { email: invite.inviteEmail } });
    if (existingOpsUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use by an ops account', 409);
    }

    if (setupPhone) {
      const existingPhone = await this.fastify.prisma.user.findFirst({ where: { phone: setupPhone } });
      if (existingPhone) {
        throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for invite phone number', 409);
      }
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOpaqueToken(otp);
    const passwordHash = await bcrypt.hash(input.password, 10);

    const ttlSeconds = Math.max(1, Math.floor((invite.expiresAt.getTime() - Date.now()) / 1000));
    const payloadKey = this.setupPayloadKey(inviteTokenHash);
    const otpKey = this.setupOtpKey(inviteTokenHash);
    const attemptKey = this.setupAttemptKey(inviteTokenHash);

    await this.fastify.redis.set(payloadKey, JSON.stringify({ name: setupName, phone: setupPhone, passwordHash }), 'EX', ttlSeconds);
    await this.fastify.redis.set(otpKey, otpHash, 'EX', Math.min(ADMIN_SETUP_OTP_TTL_SECONDS, ttlSeconds));
    await this.fastify.redis.del(attemptKey);

    const otpJobId = `admin-setup-otp:${invite.id}:${Date.now()}`;
    try {
      await this.fastify.queues.notifications.add('send-email', {
        to: invite.inviteEmail,
        template: 'OtpVerification',
        data: { otp }
      }, { jobId: otpJobId });
    } catch (error) {
      await sendNotificationFailureAlert({
        prisma: this.fastify.prisma,
        template: 'OtpVerification',
        channel: 'EMAIL',
        recipient: invite.inviteEmail,
        errorMessage: error instanceof Error ? error.message : 'Unable to enqueue admin setup OTP',
        failureStage: 'QUEUE_ENQUEUE',
        queueName: 'notifications',
        jobName: 'send-email',
        jobId: otpJobId
      });
      throw error;
    }

    return {
      message: 'OTP sent successfully',
      expiresAt: invite.expiresAt.toISOString()
    };
  }

  async cleanupExpiredAdminInvites(input?: { actorOpsUserId?: string }): Promise<{ cleaned: number }> {
    const result = await this.fastify.prisma.adminUserInvite.updateMany({
      where: {
        status: { in: ['CREATED', 'EMAIL_SENT'] },
        expiresAt: { lt: new Date() }
      },
      data: { status: 'EXPIRED_CLEANED' }
    });
    this.fastify.log.info({
      event: 'ADMIN_INVITE_CLEANUP',
      cleaned: result.count,
      actorOpsUserId: input?.actorOpsUserId ?? 'system'
    }, 'Expired admin invites cleaned up');
    return { cleaned: result.count };
  }
}
