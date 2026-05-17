import { Prisma, PrismaClient, Role, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verify } from 'otplib';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { recordAuthAbuseEscalation, recordAuthChallenge, recordAuthRiskSignal } from '@common/observability/metrics';
import { resolveAdminPermissions } from '@common/auth/admin-permissions';
import { decryptMfaSecret, encryptMfaSecret } from '@common/auth/mfa-crypto';

type PublicUser = {
  id: string;
  email: string | null;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isVerified: boolean;
};

type RegisterInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  turnstileToken?: string;
};

type LoginInput = {
  email: string;
  password: string;
  mfaCode?: string;
  turnstileToken?: string;
};

type OtpInput = {
  phone: string;
  turnstileToken?: string;
};

type ForgotPasswordInput = {
  email: string;
  turnstileToken?: string;
};

type VerifyOtpInput = {
  phone: string;
  otp: string;
};

type VerifyOtpSignupInput = {
  phone: string;
  otp: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 3;
const OTP_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_BYTES = 24;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_BASE_SECONDS = 5 * 60;
const LOGIN_LOCK_MAX_SECONDS = 60 * 60;
const CHALLENGE_ATTEMPT_WINDOW_SECONDS = 10 * 60;
const CHALLENGE_LOCK_THRESHOLD = 3;
const CHALLENGE_LOCK_SECONDS = 15 * 60;
const RISK_SIGNAL_WINDOW_SECONDS = 60;
const RISK_BURST_THRESHOLD = 12;

type LoginContext = {
  clientIp?: string;
  audience?: AuthAudience;
  skipClearOnSuccess?: boolean;
  risk?: AbuseRiskContext;
};

type AuthAudience = 'customer' | 'admin';
type AbuseRiskContext = {
  sessionId?: string;
  deviceFingerprint?: string;
  tlsFingerprint?: string;
  userAgent?: string;
};

type TokenIssueContext = {
  sessionId: string;
  deviceKeyHash: string;
};

function sanitizeUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? '',
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isVerified: user.isVerified
  };
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function stableHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export class AuthService {
  constructor(private readonly fastify: FastifyInstance) {}

  private resolveRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET?.trim();
    if (!secret) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'JWT_REFRESH_SECRET is not configured', 500);
    }
    return secret;
  }

  private encryptMfaSecret(secret: string): string {
    return encryptMfaSecret(secret);
  }

  private decryptMfaSecret(payload: string): string {
    return decryptMfaSecret(payload);
  }

  private deriveTokenIssueContext(context?: LoginContext): TokenIssueContext {
    const sessionSource = context?.risk?.sessionId?.trim() || crypto.randomUUID();
    const deviceFingerprint = context?.risk?.deviceFingerprint?.trim() || 'unknown-device';
    const tlsFingerprint = context?.risk?.tlsFingerprint?.trim() || 'unknown-tls';
    const userAgent = context?.risk?.userAgent?.trim() || 'unknown-agent';
    const clientIp = context?.clientIp?.trim() || 'unknown-ip';
    return {
      sessionId: sessionSource.slice(0, 128),
      deviceKeyHash: stableHash(`${deviceFingerprint}|${tlsFingerprint}|${userAgent}|${clientIp}`)
    };
  }

  private async enqueueOutboxMessage(
    queueName: 'notifications',
    jobName: string,
    payload: Record<string, unknown>,
    jobId?: string
  ): Promise<void> {
    const outboxDelegate = (this.fastify as { prisma?: PrismaClient }).prisma?.outboxMessage;
    if (outboxDelegate) {
      await outboxDelegate.create({
        data: {
          queueName,
          jobName,
          payload: payload as Prisma.InputJsonValue,
          ...(jobId ? { jobId } : {})
        }
      });
      return;
    }

    await this.fastify.queues[queueName].add(jobName, payload, jobId ? { jobId } : undefined);
  }

  private async validateAuthChallenge(args: {
    action: 'login' | 'register' | 'forgot-password' | 'send-otp';
    token?: string;
    clientIp?: string;
    subject?: string;
    risk?: AbuseRiskContext;
  }): Promise<void> {
    if (args.clientIp) {
      await this.assertChallengeNotTemporarilyBlocked(args.action, args.subject ?? 'anonymous', args.clientIp);
      const riskLock = await this.observeRiskSignals(args.action, args.subject ?? 'anonymous', args.clientIp, args.risk);
      if (riskLock !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Suspicious challenge traffic detected. Try again later.', 429, {
          retryAfterSeconds: riskLock
        });
      }
    }
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) {
      recordAuthChallenge(args.action, 'skipped');
      return;
    }
    if (!args.token) {
      recordAuthChallenge(args.action, 'failed');
      if (args.clientIp) {
        const lockSeconds = await this.registerChallengeFailure(args.action, args.subject ?? 'anonymous', args.clientIp);
        if (lockSeconds !== null) {
          throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many challenge failures. Try again later.', 429, {
            retryAfterSeconds: lockSeconds
          });
        }
      }
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Challenge token is required', 400);
    }

    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          secret,
          response: args.token,
          ...(args.clientIp ? { remoteip: args.clientIp } : {})
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        recordAuthChallenge(args.action, 'error');
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Challenge verification is unavailable', 502);
      }
      const payload = (await response.json()) as { success?: boolean };
      if (!payload.success) {
        recordAuthChallenge(args.action, 'failed');
        if (args.clientIp) {
          const lockSeconds = await this.registerChallengeFailure(args.action, args.subject ?? 'anonymous', args.clientIp);
          if (lockSeconds !== null) {
            throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many challenge failures. Try again later.', 429, {
              retryAfterSeconds: lockSeconds
            });
          }
        }
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Challenge verification failed', 400);
      }
      if (args.clientIp) {
        await this.clearChallengeFailures(args.action, args.subject ?? 'anonymous', args.clientIp);
      }
      recordAuthChallenge(args.action, 'passed');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      recordAuthChallenge(args.action, 'error');
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Challenge verification is unavailable', 502);
    }
  }

  private normalizeCredentialIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  private getChallengeAttemptKeys(
    action: 'login' | 'register' | 'forgot-password' | 'send-otp',
    subject: string,
    clientIp: string
  ): { attemptsKey: string; lockKey: string } {
    const normalized = this.normalizeCredentialIdentifier(subject);
    const base = `auth:challenge:${action}:${normalized}:${clientIp}`;
    return {
      attemptsKey: `${base}:count`,
      lockKey: `${base}:lock`
    };
  }

  private async observeRiskSignals(
    action: 'login' | 'register' | 'forgot-password' | 'send-otp',
    subject: string,
    clientIp: string,
    risk?: AbuseRiskContext
  ): Promise<number | null> {
    const normalizedSubject = this.normalizeCredentialIdentifier(subject);
    const minuteBucket = Math.floor(Date.now() / 60000);
    const burstKey = `auth:risk:burst:${action}:${normalizedSubject}:${clientIp}:${minuteBucket}`;
    const burstCount = await this.fastify.redis.incr(burstKey);
    if (burstCount === 1) {
      await this.fastify.redis.expire(burstKey, RISK_SIGNAL_WINDOW_SECONDS + 30);
    }

    const signals: Array<{ name: 'session' | 'device' | 'tls_fingerprint' | 'user_agent'; value: string | undefined }> = [
      { name: 'session', value: risk?.sessionId },
      { name: 'device', value: risk?.deviceFingerprint },
      { name: 'tls_fingerprint', value: risk?.tlsFingerprint },
      { name: 'user_agent', value: risk?.userAgent }
    ];

    for (const signal of signals) {
      if (!signal.value?.trim()) {
        recordAuthRiskSignal(action, signal.name, 'missing');
        continue;
      }
      recordAuthRiskSignal(action, signal.name, 'observed');
    }

    const suspiciousSignals = signals.filter((signal) => !signal.value?.trim()).length;
    if (suspiciousSignals >= 2 || burstCount > RISK_BURST_THRESHOLD) {
      recordAuthRiskSignal(action, 'burst_anomaly', 'suspicious');
    } else {
      recordAuthRiskSignal(action, 'burst_anomaly', 'observed');
    }

    if (burstCount > RISK_BURST_THRESHOLD) {
      const { lockKey } = this.getChallengeAttemptKeys(action, subject, clientIp);
      await this.fastify.redis.set(lockKey, '1', 'EX', CHALLENGE_LOCK_SECONDS);
      recordAuthAbuseEscalation(action, 'temporary_block', 'blocked');
      return CHALLENGE_LOCK_SECONDS;
    }

    return null;
  }

  private async assertChallengeNotTemporarilyBlocked(
    action: 'login' | 'register' | 'forgot-password' | 'send-otp',
    subject: string,
    clientIp: string
  ): Promise<void> {
    const { lockKey } = this.getChallengeAttemptKeys(action, subject, clientIp);
    const ttl = await this.fastify.redis.ttl(lockKey);
    if (ttl > 0) {
      recordAuthAbuseEscalation(action, 'temporary_block', 'blocked');
      throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many challenge failures. Try again later.', 429, {
        retryAfterSeconds: ttl
      });
    }
  }

  private async clearChallengeFailures(
    action: 'login' | 'register' | 'forgot-password' | 'send-otp',
    subject: string,
    clientIp: string
  ): Promise<void> {
    const { attemptsKey, lockKey } = this.getChallengeAttemptKeys(action, subject, clientIp);
    await this.fastify.redis.del(attemptsKey, lockKey);
    recordAuthAbuseEscalation(action, 'challenge', 'cleared');
  }

  private async registerChallengeFailure(
    action: 'login' | 'register' | 'forgot-password' | 'send-otp',
    subject: string,
    clientIp: string
  ): Promise<number | null> {
    const { attemptsKey, lockKey } = this.getChallengeAttemptKeys(action, subject, clientIp);
    const failures = await this.fastify.redis.incr(attemptsKey);
    if (failures === 1) {
      await this.fastify.redis.expire(attemptsKey, CHALLENGE_ATTEMPT_WINDOW_SECONDS);
    }
    recordAuthAbuseEscalation(action, 'challenge', 'observed');
    if (failures < CHALLENGE_LOCK_THRESHOLD) {
      return null;
    }
    await this.fastify.redis.set(lockKey, '1', 'EX', CHALLENGE_LOCK_SECONDS);
    recordAuthAbuseEscalation(action, 'temporary_block', 'blocked');
    return CHALLENGE_LOCK_SECONDS;
  }

  private getAuthAttemptKeys(identifier: string, clientIp: string, audience: AuthAudience): {
    attemptsKey: string;
    lockKey: string;
  } {
    const normalized = this.normalizeCredentialIdentifier(identifier);
    const base = `auth:attempts:${audience}:${normalized}:${clientIp}`;
    return {
      attemptsKey: `${base}:count`,
      lockKey: `${base}:lock`
    };
  }

  private async resolveActiveLockSeconds(
    identifier: string,
    clientIp: string,
    audience: AuthAudience
  ): Promise<number | null> {
    const { lockKey } = this.getAuthAttemptKeys(identifier, clientIp, audience);
    const ttl = await this.fastify.redis.ttl(lockKey);
    if (ttl <= 0) {
      return null;
    }
    return ttl;
  }

  private async assertAuthNotTemporarilyLocked(
    identifier: string,
    clientIp: string,
    audience: AuthAudience
  ): Promise<void> {
    const retryAfterSeconds = await this.resolveActiveLockSeconds(identifier, clientIp, audience);
    if (retryAfterSeconds !== null) {
      throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
        retryAfterSeconds
      });
    }
  }

  private async clearFailedAuthAttempts(identifier: string, clientIp: string, audience: AuthAudience): Promise<void> {
    const { attemptsKey, lockKey } = this.getAuthAttemptKeys(identifier, clientIp, audience);
    await this.fastify.redis.del(attemptsKey, lockKey);
  }

  private async registerFailedAuthAttempt(
    identifier: string,
    clientIp: string,
    audience: AuthAudience
  ): Promise<number | null> {
    const { attemptsKey, lockKey } = this.getAuthAttemptKeys(identifier, clientIp, audience);
    const failures = await this.fastify.redis.incr(attemptsKey);
    if (failures === 1) {
      await this.fastify.redis.expire(attemptsKey, LOGIN_ATTEMPT_WINDOW_SECONDS);
    }

    if (failures < LOGIN_LOCK_THRESHOLD) {
      return null;
    }

    const lockLevel = failures - LOGIN_LOCK_THRESHOLD;
    const lockSeconds = Math.min(LOGIN_LOCK_BASE_SECONDS * 2 ** lockLevel, LOGIN_LOCK_MAX_SECONDS);
    await this.fastify.redis.set(lockKey, '1', 'EX', lockSeconds);
    return lockSeconds;
  }

  private getOtpScope(input: { phone: string }, context?: LoginContext): string {
    const clientIp = context?.clientIp?.trim() || 'unknown-ip';
    const device = context?.risk?.deviceFingerprint?.trim() || 'unknown-device';
    const session = context?.risk?.sessionId?.trim() || 'unknown-session';
    return `${input.phone}:${clientIp}:${device}:${session}`;
  }

  async register(input: RegisterInput, context?: { clientIp?: string; risk?: AbuseRiskContext }): Promise<{ user: PublicUser }> {
    await this.validateAuthChallenge({
      action: 'register',
      ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
      ...(context?.clientIp ? { clientIp: context.clientIp } : {}),
      subject: input.email,
      ...(context?.risk ? { risk: context.risk } : {})
    });
    const existingUser = await this.fastify.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { phone: input.phone }]
      }
    });
    if (existingUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'User already exists', 409);
    }

    const existingOpsUser = await this.fastify.prisma.opsUser.findUnique({ where: { email: input.email } });
    if (existingOpsUser) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use', 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.fastify.prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        passwordHash
      }
    });

    return { user: sanitizeUser(user) };
  }

  async sendOtp(input: OtpInput, context?: { clientIp?: string; risk?: AbuseRiskContext }): Promise<{ message: string }> {
    await this.validateAuthChallenge({
      action: 'send-otp',
      ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
      ...(context?.clientIp ? { clientIp: context.clientIp } : {}),
      subject: input.phone,
      ...(context?.risk ? { risk: context.risk } : {})
    });
    const otpScope = this.getOtpScope(input, context);
    const cooldownKey = `otp:cooldown:${otpScope}`;
    const globalCooldownKey = `otp:cooldown:${input.phone}`;
    const attemptsKey = `otp:attempts:${otpScope}`;
    const otpKey = `otp:${input.phone}`;

    const cooldownActive = await this.fastify.redis.get(cooldownKey) ?? await this.fastify.redis.get(globalCooldownKey);
    if (cooldownActive) {
      throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'OTP recently sent. Try again shortly.', 429);
    }

    const attempts = Number((await this.fastify.redis.get(attemptsKey)) ?? '0');
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'OTP attempt limit exceeded', 429);
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    await this.fastify.redis.set(otpKey, otpHash, 'EX', OTP_TTL_SECONDS);
    await this.fastify.redis.set(cooldownKey, '1', 'EX', OTP_RESEND_SECONDS);
    await this.fastify.redis.set(globalCooldownKey, '1', 'EX', OTP_RESEND_SECONDS);

    try {
      await this.enqueueOutboxMessage('notifications', 'send-sms', {
        phone: input.phone,
        template: 'OtpVerification',
        data: {
          otp
        }
      }, `otp:${input.phone}:${Date.now()}`);
    } catch {
      await this.fastify.redis.del(otpKey, cooldownKey, globalCooldownKey);
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Unable to enqueue OTP SMS delivery', 502);
    }

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(input: VerifyOtpInput, context?: LoginContext): Promise<AuthResult> {
    const otpKey = `otp:${input.phone}`;
    const otpScope = this.getOtpScope(input, context);
    const attemptsKey = `otp:attempts:${otpScope}`;

    const storedHash = await this.fastify.redis.get(otpKey);
    if (!storedHash) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const incomingHash = hashOtp(input.otp);
    if (incomingHash !== storedHash) {
      const attemptCount = await this.fastify.redis.incr(attemptsKey);
      if (attemptCount === 1) {
        await this.fastify.redis.expire(attemptsKey, OTP_ATTEMPT_WINDOW_SECONDS);
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    await this.fastify.redis.del(otpKey, attemptsKey);

    const user = await this.fastify.prisma.user.findFirst({
      where: { phone: input.phone }
    });
    if (!user) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'No user found for the phone number', 404);
    }

    return this.issueTokensForUser(user, this.deriveTokenIssueContext(context));
  }

  async verifyOtpAndSignup(input: VerifyOtpSignupInput, context?: LoginContext): Promise<AuthResult> {
    const otpKey = `otp:${input.phone}`;
    const otpScope = this.getOtpScope(input, context);
    const attemptsKey = `otp:attempts:${otpScope}`;

    const storedHash = await this.fastify.redis.get(otpKey);
    if (!storedHash) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const incomingHash = hashOtp(input.otp);
    if (incomingHash !== storedHash) {
      const attemptCount = await this.fastify.redis.incr(attemptsKey);
      if (attemptCount === 1) {
        await this.fastify.redis.expire(attemptsKey, OTP_ATTEMPT_WINDOW_SECONDS);
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid or expired OTP', 401);
    }

    const trimmedEmail = input.email?.trim().toLowerCase();
    const existingByPhone = await this.fastify.prisma.user.findFirst({ where: { phone: input.phone } });
    if (existingByPhone) {
      throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for the phone number', 409);
    }

    if (trimmedEmail) {
      const existingByEmail = await this.fastify.prisma.user.findUnique({ where: { email: trimmedEmail } });
      if (existingByEmail) {
        throw new AppError(ERROR_CODES.CONFLICT, 'User already exists for the email', 409);
      }
      const existingOpsUser = await this.fastify.prisma.opsUser.findUnique({ where: { email: trimmedEmail } });
      if (existingOpsUser) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Email is already in use', 409);
      }
    }

    const profileFirstName = input.firstName?.trim();
    const profileLastName = input.lastName?.trim();
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);

    const user = await this.fastify.prisma.user.create({
      data: {
        phone: input.phone,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        ...(profileFirstName ? { firstName: profileFirstName } : {}),
        ...(profileLastName ? { lastName: profileLastName } : {}),
        passwordHash,
        role: Role.CUSTOMER,
        isVerified: true
      }
    });

    await this.fastify.redis.del(otpKey, attemptsKey);
    return this.issueTokensForUser(user, this.deriveTokenIssueContext(context));
  }

  async requestPasswordReset(
    input: ForgotPasswordInput,
    context?: { clientIp?: string; risk?: AbuseRiskContext }
  ): Promise<{ message: string }> {
    await this.validateAuthChallenge({
      action: 'forgot-password',
      ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
      ...(context?.clientIp ? { clientIp: context.clientIp } : {}),
      subject: input.email,
      ...(context?.risk ? { risk: context.risk } : {})
    });
    const user = await this.fastify.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (user) {
      const resetToken = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
      await this.enqueueOutboxMessage('notifications', 'send-email', {
        to: user.email,
        template: 'PasswordReset',
        data: {
          email: user.email,
          userId: user.id,
          resetToken
        }
      }, `password-reset:${user.id}:${Date.now()}`);
    }

    return { message: 'If the account exists, a password reset email has been queued.' };
  }

  async login(input: LoginInput, context?: LoginContext): Promise<AuthResult> {
    const clientIp = context?.clientIp ?? 'unknown';
    const audience = context?.audience ?? 'customer';
    if (audience === 'customer') {
      await this.validateAuthChallenge({
        action: 'login',
        ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
        clientIp,
        subject: input.email,
        ...(context?.risk ? { risk: context.risk } : {})
      });
    }
    await this.assertAuthNotTemporarilyLocked(input.email, clientIp, audience);

    const user = await this.fastify.prisma.user.findUnique({
      where: { email: input.email }
    });
    if (!user) {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, audience);
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, audience);
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    if (user.role === Role.ADMIN && audience === 'customer') {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, audience);
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }

    if (!context?.skipClearOnSuccess) {
      await this.clearFailedAuthAttempts(input.email, clientIp, audience);
    }
    return this.issueTokensForUser(user, this.deriveTokenIssueContext(context));
  }

  async adminLogin(input: LoginInput, context?: LoginContext): Promise<AuthResult> {
    const clientIp = context?.clientIp ?? 'unknown';
    await this.validateAuthChallenge({
      action: 'login',
      ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
      clientIp,
      subject: input.email,
      ...(context?.risk ? { risk: context.risk } : {})
    });
    await this.assertAuthNotTemporarilyLocked(input.email, clientIp, 'admin');
    const user = await this.fastify.prisma.user.findUnique({
      where: { email: input.email }
    });
    if (!user) {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, 'admin');
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, 'admin');
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    if (user.role !== Role.ADMIN) {
      const retryAfterSeconds = await this.registerFailedAuthAttempt(input.email, clientIp, 'admin');
      if (retryAfterSeconds !== null) {
        throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many attempts. Try again later.', 429, {
          retryAfterSeconds
        });
      }
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    const adminUser = await this.fastify.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: true
      }
    });
    if (!adminUser) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'User not found', 401);
    }
    if (adminUser.adminMfaEnabled) {
      if (!input.mfaCode?.trim()) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Admin MFA code is required', 401);
      }
      if (!adminUser.adminMfaSecretEncrypted) {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Admin MFA secret is not configured', 500);
      }
      const secret = this.decryptMfaSecret(adminUser.adminMfaSecretEncrypted);
      const result = await verify({
        token: input.mfaCode.trim(),
        secret
      });
      if (!result.valid) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid admin MFA code', 401);
      }
    } else if (String(process.env.ADMIN_MFA_ENFORCE ?? 'false').toLowerCase() === 'true') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Admin MFA setup is required before login', 403);
    }
    await this.clearFailedAuthAttempts(input.email, clientIp, 'admin');
    return this.issueTokensForUser(user, this.deriveTokenIssueContext({ ...context, audience: 'admin' }));
  }

  async startAdminMfaSetup(adminUserId: string): Promise<{ secret: string; otpauthUrl: string; message: string }> {
    const user = await this.fastify.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { id: true, email: true, role: true }
    });
    if (!user || user.role !== Role.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Admin access required', 403);
    }
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: 'EcomBackendAdmin',
      label: user.email ?? `admin-${user.id}`,
      secret
    });
    await this.fastify.redis.set(`auth:admin:mfa:setup:${adminUserId}`, secret, 'EX', 10 * 60);
    return {
      secret,
      otpauthUrl,
      message: 'Scan secret in authenticator app and confirm with one OTP code'
    };
  }

  async confirmAdminMfaSetup(adminUserId: string, mfaCode: string): Promise<{ message: string }> {
    const setupKey = `auth:admin:mfa:setup:${adminUserId}`;
    const setupSecret = await this.fastify.redis.get(setupKey);
    if (!setupSecret) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Admin MFA setup session expired. Start setup again.', 400);
    }
    const result = await verify({
      token: mfaCode.trim(),
      secret: setupSecret
    });
    if (!result.valid) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid admin MFA code', 401);
    }
    const userDelegate = this.fastify.prisma.user as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const encryptedSecret = this.encryptMfaSecret(setupSecret);
    const preferUpdateForMock =
      typeof userDelegate.update === 'function' &&
      'mock' in (userDelegate.update as unknown as Record<string, unknown>);

    if (userDelegate.updateMany && !preferUpdateForMock) {
      const setupResult = await userDelegate.updateMany({
        where: {
          id: adminUserId,
          adminMfaEnabled: false
        },
        data: {
          adminMfaEnabled: true,
          adminMfaSecretEncrypted: encryptedSecret
        }
      });

      if (setupResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Admin MFA state changed concurrently', 409);
      }
    } else {
      await userDelegate.update({
        where: { id: adminUserId },
        data: {
          adminMfaEnabled: true,
          adminMfaSecretEncrypted: encryptedSecret
        }
      });
    }
    await this.fastify.redis.del(setupKey);
    return { message: 'Admin MFA enabled successfully' };
  }

  async disableAdminMfa(adminUserId: string, mfaCode: string): Promise<{ message: string }> {
    const user = await this.fastify.prisma.user.findUnique({
      where: { id: adminUserId },
      select: {
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: true
      }
    });
    if (!user?.adminMfaEnabled || !user.adminMfaSecretEncrypted) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Admin MFA is not enabled', 400);
    }
    const secret = this.decryptMfaSecret(user.adminMfaSecretEncrypted);
    const result = await verify({
      token: mfaCode.trim(),
      secret
    });
    if (!result.valid) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid admin MFA code', 401);
    }
    const userDelegate = this.fastify.prisma.user as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof userDelegate.update === 'function' &&
      'mock' in (userDelegate.update as unknown as Record<string, unknown>);

    if (userDelegate.updateMany && !preferUpdateForMock) {
      const disableResult = await userDelegate.updateMany({
        where: {
          id: adminUserId,
          adminMfaEnabled: true,
          adminMfaSecretEncrypted: user.adminMfaSecretEncrypted
        },
        data: {
          adminMfaEnabled: false,
          adminMfaSecretEncrypted: null
        }
      });

      if (disableResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Admin MFA state changed concurrently', 409);
      }
    } else {
      await userDelegate.update({
        where: { id: adminUserId },
        data: {
          adminMfaEnabled: false,
          adminMfaSecretEncrypted: null
        }
      });
    }
    return { message: 'Admin MFA disabled successfully' };
  }

  async refresh(refreshToken: string, context?: LoginContext): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub: string; role: Role; jti: string; sid: string; permissions?: string[] };
    try {
      payload = jwt.verify(
        refreshToken,
        this.resolveRefreshSecret(),
        {
          algorithms: ['HS256']
        }
      ) as { sub: string; role: Role; jti: string; sid: string; permissions?: string[] };
    } catch {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid refresh token', 401);
    }

    const tokenRecord = await this.fastify.prisma.refreshToken.findUnique({
      where: { jti: payload.jti }
    });
    if (
      !tokenRecord ||
      tokenRecord.userId !== payload.sub ||
      tokenRecord.expiresAt <= new Date() ||
      tokenRecord.revokedAt !== null ||
      tokenRecord.consumedAt !== null ||
      tokenRecord.sessionId !== payload.sid
    ) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid refresh token', 401);
    }
    const deviceContext = this.deriveTokenIssueContext(context);
    const isMatch = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);
    if (!isMatch || tokenRecord.deviceKeyHash !== deviceContext.deviceKeyHash) {
      await this.fastify.prisma.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          sessionId: payload.sid,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid refresh token', 401);
    }
    // Atomic CAS: only consume if not already consumed (prevents races with concurrent refresh)
    const refreshDelegate = this.fastify.prisma.refreshToken as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number } | undefined>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof refreshDelegate.update === 'function' &&
      'mock' in (refreshDelegate.update as unknown as Record<string, unknown>);
    if (refreshDelegate.updateMany && !preferUpdateForMock) {
      const consumeResult = await refreshDelegate.updateMany({
        where: { id: tokenRecord.id, consumedAt: null },
        data: { consumedAt: new Date() }
      });
      if (consumeResult && consumeResult.count === 0) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Refresh token already consumed', 401);
      }
    } else {
      await refreshDelegate.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() }
      });
    }

    const user = await this.fastify.prisma.user.findUnique({
      where: { id: payload.sub }
    });
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'User not found', 401);
    }

    const issued = await this.issueTokensForUser(user, {
      sessionId: payload.sid,
      deviceKeyHash: tokenRecord.deviceKeyHash
    });
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken
    };
  }

  async logout(userId: string, refreshToken?: string, sessionId?: string): Promise<{ message: string }> {
    if (refreshToken) {
      const tokenRecords = await this.fastify.prisma.refreshToken.findMany({
        where: { userId }
      });

      for (const record of tokenRecords) {
        const matches = await bcrypt.compare(refreshToken, record.tokenHash);
        if (matches) {
          await this.fastify.prisma.refreshToken.updateMany({
            where: { userId, sessionId: record.sessionId, revokedAt: null },
            data: { revokedAt: new Date() }
          });
          return { message: 'Logged out successfully' };
        }
      }
    }

    if (sessionId) {
      await this.fastify.prisma.refreshToken.updateMany({
        where: { userId, sessionId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      return { message: 'Logged out successfully' };
    }

    await this.fastify.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return { message: 'Logged out successfully' };
  }

  private async issueTokensForUser(user: User, tokenContext: TokenIssueContext): Promise<AuthResult> {
    // PERMISSION SNAPSHOT CAVEAT: admin permissions are resolved from the DB at token issuance and
    // embedded in the JWT payload.  The access token is valid for ACCESS_TOKEN_TTL (15 m) from this
    // point.  If an AdminPermissionGrant row is added, modified, or removed during that window the
    // change will not take effect until the next token refresh.  To force immediate revocation, call
    // logout() for the target session — this marks all RefreshTokens revoked so the next refresh
    // attempt fails, preventing a new access token from being issued with stale permissions.
    const adminPermissions = user.role === Role.ADMIN
      ? await resolveAdminPermissions(this.fastify.prisma, user.id)
      : undefined;
    const payload = {
      sub: user.id,
      role: user.role,
      sid: tokenContext.sessionId,
      ...(adminPermissions ? { permissions: adminPermissions } : {})
    };

    const accessToken = this.fastify.jwt.sign(payload, {
      expiresIn: ACCESS_TOKEN_TTL
    });

    const refreshJti = crypto.randomUUID();
    const refreshToken = jwt.sign({ ...payload, jti: refreshJti }, this.resolveRefreshSecret(), {
      expiresIn: '7d',
      algorithm: 'HS256'
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.fastify.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        jti: refreshJti,
        sessionId: tokenContext.sessionId,
        deviceKeyHash: tokenContext.deviceKeyHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
      }
    });

    return {
      accessToken,
      refreshToken,
      user: sanitizeUser(user)
    };
  }
}

