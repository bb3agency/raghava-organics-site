import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { getCurrentUser } from '@common/decorators/current-user';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { opsAuthGuard } from '@common/guards/ops-auth.guard';
import { opsPermissionGuard } from '@common/guards/ops-permissions.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { idempotencyOnSend, idempotencyPreHandler } from '@common/idempotency/idempotency';
import { AuthService } from './auth.service';
import { AdminInvitesService } from './admin-invites.service';
import {
  adminInviteCleanupSchema,
  adminInviteSetupOtpSchema,
  adminInviteConsumeSchema,
  adminInviteCreateSchema,
  adminLoginRequestOtpSchema,
  adminLoginVerifyOtpSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  sendOtpSchema,
  signupPhoneSchema,
  verifyOtpSchema
} from './auth.schemas';

function parseRefreshTokenFromCookie(cookieHeader?: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const tokenPart = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('refresh_token='));

  if (!tokenPart) {
    return undefined;
  }

  return decodeURIComponent(tokenPart.replace('refresh_token=', ''));
}

function setRefreshTokenCookie(reply: { header: (name: string, value: string) => unknown }, token: string): void {
  const cookie = [
    `refresh_token=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${7 * 24 * 60 * 60}`
  ].join('; ');
  reply.header('Set-Cookie', cookie);
}

function clearRefreshTokenCookie(reply: { header: (name: string, value: string) => unknown }): void {
  const cookie = [
    'refresh_token=',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ].join('; ');
  reply.header('Set-Cookie', cookie);
}

function extractAbuseRiskContext(headers: Record<string, unknown>): {
  sessionId?: string;
  deviceFingerprint?: string;
  tlsFingerprint?: string;
  userAgent?: string;
} {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 256) : undefined;
  };

  const sessionId = header('x-session-id') ?? header('x-session-token');
  const deviceFingerprint = header('x-device-fingerprint');
  const tlsFingerprint = header('x-ja3-fingerprint');
  const userAgent = header('user-agent');

  return {
    ...(sessionId ? { sessionId } : {}),
    ...(deviceFingerprint ? { deviceFingerprint } : {}),
    ...(tlsFingerprint ? { tlsFingerprint } : {}),
    ...(userAgent ? { userAgent } : {})
  };
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify);
  const adminInvitesService = new AdminInvitesService(fastify);
  fastify.addHook('onSend', async (request, reply, payload) => {
    await idempotencyOnSend(request, reply, payload);
    return payload;
  });

  fastify.post(
    '/api/v1/auth/register',
    {
      schema: registerSchema,
      preHandler: [idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) =>
      authService.register(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      })
  );

  fastify.post(
    '/api/v1/auth/send-otp',
    {
      schema: sendOtpSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) =>
      authService.sendOtp(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      })
  );

  fastify.post(
    '/api/v1/auth/verify-otp',
    {
      schema: verifyOtpSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request, reply) => {
      const auth = await authService.verifyOtp(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      });
      setRefreshTokenCookie(reply, auth.refreshToken);
      return {
        accessToken: auth.accessToken,
        user: auth.user
      };
    }
  );

  fastify.post(
    '/api/v1/auth/signup-phone',
    {
      schema: signupPhoneSchema,
      preHandler: [idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request, reply) => {
      const auth = await authService.verifyOtpAndSignup(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      });
      setRefreshTokenCookie(reply, auth.refreshToken);
      return {
        accessToken: auth.accessToken,
        user: auth.user
      };
    }
  );

  fastify.post(
    '/api/v1/auth/forgot-password',
    {
      schema: forgotPasswordSchema,
      preHandler: [idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) =>
      authService.requestPasswordReset(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      })
  );

  fastify.post(
    '/api/v1/auth/login',
    {
      schema: loginSchema,
      preHandler: [idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.authLogin
      }
    },
    async (request, reply) => {
      const auth = await authService.login(request.body as never, {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      });
      setRefreshTokenCookie(reply, auth.refreshToken);
      return {
        accessToken: auth.accessToken,
        user: auth.user
      };
    }
  );

  fastify.post(
    '/api/v1/auth/refresh',
    {
      schema: refreshSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request, reply) => {
      const token = parseRefreshTokenFromCookie(request.headers.cookie);
      const refreshed = await authService.refresh(token ?? '', {
        clientIp: request.ip,
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      });
      setRefreshTokenCookie(reply, refreshed.refreshToken);
      return { accessToken: refreshed.accessToken };
    }
  );

  fastify.post(
    '/api/v1/auth/logout',
    {
      schema: logoutSchema,
      preHandler: [
        jwtAuthGuard,
        async (request, reply) => {
          if (request.user?.role === Role.CUSTOMER || request.user?.role === Role.ADMIN) {
            return;
          }
          await rolesGuard(Role.CUSTOMER)(request, reply);
        }
      ]
    },
    async (request, reply) => {
      const user = getCurrentUser(request);
      const token = parseRefreshTokenFromCookie(request.headers.cookie);
      const result = await authService.logout(user.sub, token, user.sid);
      clearRefreshTokenCookie(reply);
      return result;
    }
  );

  fastify.post(
    '/api/v1/auth/admin/login/request-otp',
    {
      schema: adminLoginRequestOtpSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) => {
      const body = request.body as { email: string; password: string; turnstileToken?: string };
      return authService.requestAdminLoginOtp({
        email: body.email,
        password: body.password,
        clientIp: request.ip,
        ...(body.turnstileToken ? { turnstileToken: body.turnstileToken } : {}),
        risk: extractAbuseRiskContext(request.headers as Record<string, unknown>)
      });
    }
  );

  fastify.post(
    '/api/v1/auth/admin/login/verify-otp',
    {
      schema: adminLoginVerifyOtpSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request, reply) => {
      const body = request.body as { email: string; otp: string };
      const auth = await authService.verifyAdminLoginOtp({
        email: body.email,
        otp: body.otp,
        clientIp: request.ip
      });
      setRefreshTokenCookie(reply, auth.refreshToken);
      return {
        accessToken: auth.accessToken,
        admin: auth.user
      };
    }
  );

  fastify.post(
    '/api/v1/admin/invites',
    {
      schema: adminInviteCreateSchema,
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: {
        rateLimit: routeRateLimitProfiles.opsCritical
      }
    },
    async (request) => {
      const body = request.body as {
        email: string;
        name: string;
        permissions: string[];
        setupBaseUrl: string;
      };
      return adminInvitesService.createAdminInvite({
        ...(request.opsUser?.id ? { createdByOpsUserId: request.opsUser.id } : {}),
        inviteEmail: body.email,
        inviteName: body.name,
        permissions: body.permissions,
        setupBaseUrl: body.setupBaseUrl
      });
    }
  );

  fastify.post(
    '/api/v1/admin/invites/setup/send-otp',
    {
      schema: adminInviteSetupOtpSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) => {
      const body = request.body as { token: string; name: string; password: string; phone?: string };
      return adminInvitesService.sendSetupOtp({
        inviteToken: body.token,
        name: body.name,
        password: body.password,
        ...(body.phone ? { phone: body.phone } : {})
      });
    }
  );

  fastify.post(
    '/api/v1/admin/invites/consume',
    {
      schema: adminInviteConsumeSchema,
      config: {
        rateLimit: routeRateLimitProfiles.authSensitive
      }
    },
    async (request) => {
      const body = request.body as { token: string; otp: string };
      return adminInvitesService.consumeAdminInvite({
        inviteToken: body.token,
        otp: body.otp
      });
    }
  );

  fastify.post(
    '/api/v1/admin/invites/cleanup-expired',
    {
      schema: adminInviteCleanupSchema,
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: {
        rateLimit: routeRateLimitProfiles.opsCritical
      }
    },
    async (request) => {
      const opsUser = (request as unknown as { opsUser?: { id: string } }).opsUser;
      return adminInvitesService.cleanupExpiredAdminInvites(opsUser ? { actorOpsUserId: opsUser.id } : {});
    }
  );

}

