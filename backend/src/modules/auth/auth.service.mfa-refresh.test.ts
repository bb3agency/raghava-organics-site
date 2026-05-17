import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateSync } from 'otplib';

import { AuthService } from './auth.service';

function createFastifyMock() {
  const redisTtl = vi.fn(async () => -1);
  const redisDel = vi.fn(async () => 1);
  const redisSet = vi.fn(async () => 'OK');
  const redisGet = vi.fn<() => Promise<string | null>>(async () => null);
  const redisIncr = vi.fn(async () => 1);
  const redisExpire = vi.fn(async () => 1);
  const userFindUnique = vi.fn();
  const userUpdate = vi.fn();
  const refreshCreate = vi.fn();
  const refreshFindUnique = vi.fn();
  const refreshUpdate = vi.fn();
  const refreshUpdateMany = vi.fn();
  const jwtSign = vi.fn(() => 'access-token');

  return {
    fastify: {
      redis: {
        ttl: redisTtl,
        del: redisDel,
        set: redisSet,
        get: redisGet,
        incr: redisIncr,
        expire: redisExpire
      },
      prisma: {
        user: {
          findUnique: userFindUnique,
          update: userUpdate
        },
        refreshToken: {
          create: refreshCreate,
          findUnique: refreshFindUnique,
          update: refreshUpdate,
          updateMany: refreshUpdateMany
        },
        adminPermissionGrant: {
          findMany: vi.fn(async () => [])
        }
      },
      jwt: {
        sign: jwtSign
      }
    } as unknown as FastifyInstance,
    mocks: {
      redisTtl,
      redisDel,
      redisSet,
      redisGet,
      redisIncr,
      redisExpire,
      userFindUnique,
      userUpdate,
      refreshCreate,
      refreshFindUnique,
      refreshUpdate,
      refreshUpdateMany,
      jwtSign
    }
  };
}

describe('AuthService MFA + refresh hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.ADMIN_MFA_ENCRYPTION_KEY = 'test-admin-mfa-encryption-key';
    process.env.ADMIN_MFA_ENFORCE = 'false';
  });

  it('starts admin MFA setup and stores short-lived secret', async () => {
    const { fastify, mocks } = createFastifyMock();
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      role: Role.ADMIN
    });
    const service = new AuthService(fastify);

    const result = await service.startAdminMfaSetup('admin-1');

    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.otpauthUrl).toContain('otpauth://');
    expect(mocks.redisSet).toHaveBeenCalledWith('auth:admin:mfa:setup:admin-1', expect.any(String), 'EX', 600);
  });

  it('confirms admin MFA setup and persists encrypted secret', async () => {
    const { fastify, mocks } = createFastifyMock();
    const secret = generateSecret();
    mocks.redisGet.mockResolvedValue(secret);
    const service = new AuthService(fastify);

    const token = generateSync({ secret });
    const result = await service.confirmAdminMfaSetup('admin-1', token);

    expect(result.message).toContain('enabled');
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: expect.objectContaining({
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: expect.any(String)
      })
    });
    expect(mocks.redisDel).toHaveBeenCalledWith('auth:admin:mfa:setup:admin-1');
  });

  it('uses guarded updateMany when confirming admin MFA setup with a real delegate', async () => {
    const secret = generateSecret();
    const userUpdateMany = vi.fn(async () => ({ count: 1 }));
    const userUpdate = async () => ({ id: 'admin-1' });
    const redisGet = vi.fn(async () => secret);
    const redisDel = vi.fn(async () => 1);
    const service = new AuthService({
      redis: {
        get: redisGet,
        del: redisDel
      },
      prisma: {
        user: {
          update: userUpdate,
          updateMany: userUpdateMany
        }
      }
    } as unknown as FastifyInstance);

    const token = generateSync({ secret });
    await expect(service.confirmAdminMfaSetup('admin-1', token)).resolves.toEqual({
      message: 'Admin MFA enabled successfully'
    });

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'admin-1',
        adminMfaEnabled: false
      },
      data: expect.objectContaining({
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: expect.any(String)
      })
    });
    expect(redisDel).toHaveBeenCalledWith('auth:admin:mfa:setup:admin-1');
  });

  it('fails admin MFA setup when guarded update loses the race', async () => {
    const secret = generateSecret();
    const userUpdateMany = vi.fn(async () => ({ count: 0 }));
    const userUpdate = async () => ({ id: 'admin-1' });
    const service = new AuthService({
      redis: {
        get: vi.fn(async () => secret),
        del: vi.fn()
      },
      prisma: {
        user: {
          update: userUpdate,
          updateMany: userUpdateMany
        }
      }
    } as unknown as FastifyInstance);

    const token = generateSync({ secret });
    await expect(service.confirmAdminMfaSetup('admin-1', token)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409
    });
  });

  it('uses guarded updateMany when disabling admin MFA with a real delegate', async () => {
    const secret = generateSecret();
    const userUpdateMany = vi.fn(async () => ({ count: 1 }));
    const userUpdate = async () => ({ id: 'admin-1' });
    const service = new AuthService({
      prisma: {
        user: {
          findUnique: vi.fn(),
          update: userUpdate,
          updateMany: userUpdateMany
        }
      }
    } as unknown as FastifyInstance);
    const encryptedSecret = (service as unknown as { encryptMfaSecret: (value: string) => string }).encryptMfaSecret(secret);
    const findUnique = (service as unknown as { fastify: FastifyInstance }).fastify.prisma.user.findUnique as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValue({
      adminMfaEnabled: true,
      adminMfaSecretEncrypted: encryptedSecret
    });

    const token = generateSync({ secret });
    await expect(service.disableAdminMfa('admin-1', token)).resolves.toEqual({
      message: 'Admin MFA disabled successfully'
    });

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'admin-1',
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: encryptedSecret
      },
      data: {
        adminMfaEnabled: false,
        adminMfaSecretEncrypted: null
      }
    });
  });

  it('requires MFA code on admin login when MFA enabled', async () => {
    const { fastify, mocks } = createFastifyMock();
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
        phone: null,
        passwordHash: bcrypt.hashSync('password-123', 10),
        firstName: 'Admin',
        lastName: 'User',
        role: Role.ADMIN,
        isVerified: true
      })
      .mockResolvedValueOnce({
        adminMfaEnabled: true,
        adminMfaSecretEncrypted: 'encrypted-secret'
      });
    const service = new AuthService(fastify);

    await expect(service.adminLogin({ email: 'admin@example.com', password: 'password-123' }, { clientIp: '127.0.0.1' }))
      .rejects
      .toMatchObject({ code: 'UNAUTHORISED', statusCode: 401 });
  });

  it('requires challenge token for admin login when turnstile is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    const { fastify, mocks } = createFastifyMock();
    const service = new AuthService(fastify);
    await expect(
      service.adminLogin(
        { email: 'admin@example.com', password: 'password-123' },
        { clientIp: '127.0.0.1', risk: { sessionId: 's-1' } }
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('returns generic invalid credentials for admin account on customer login path', async () => {
    const { fastify, mocks } = createFastifyMock();
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-2',
      email: 'admin2@example.com',
      phone: null,
      passwordHash: bcrypt.hashSync('password-123', 10),
      firstName: 'Admin',
      lastName: 'Two',
      role: Role.ADMIN,
      isVerified: true
    });
    const service = new AuthService(fastify);

    await expect(
      service.login(
        { email: 'admin2@example.com', password: 'password-123' },
        { clientIp: '127.0.0.1', audience: 'customer' }
      )
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('returns generic invalid credentials for non-admin on admin login path', async () => {
    const { fastify, mocks } = createFastifyMock();
    mocks.userFindUnique.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      phone: null,
      passwordHash: bcrypt.hashSync('password-123', 10),
      firstName: 'Customer',
      lastName: 'One',
      role: Role.CUSTOMER,
      isVerified: true
    });
    const service = new AuthService(fastify);

    await expect(
      service.adminLogin(
        { email: 'customer@example.com', password: 'password-123' },
        { clientIp: '127.0.0.1' }
      )
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('revokes refresh session family on device mismatch', async () => {
    const { fastify, mocks } = createFastifyMock();
    const refreshToken = jwt.sign(
      { sub: 'admin-1', role: Role.ADMIN, jti: 'jti-1', sid: 'session-1' },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: '7d' }
    );
    mocks.refreshFindUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'admin-1',
      jti: 'jti-1',
      sessionId: 'session-1',
      tokenHash: bcrypt.hashSync(refreshToken, 10),
      deviceKeyHash: 'different-device-hash',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const service = new AuthService(fastify);

    await expect(
      service.refresh(refreshToken, {
        clientIp: '127.0.0.1',
        risk: { sessionId: 'session-1', deviceFingerprint: 'device-a', tlsFingerprint: 'tls-a', userAgent: 'ua-a' }
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORISED', statusCode: 401 });

    expect(mocks.refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'admin-1',
          sessionId: 'session-1',
          revokedAt: null
        })
      })
    );
  });

  it('rotates refresh token on valid single-use refresh', async () => {
    const { fastify, mocks } = createFastifyMock();
    const refreshToken = jwt.sign(
      { sub: 'admin-1', role: Role.ADMIN, jti: 'jti-1', sid: 'session-1' },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: '7d' }
    );
    const deviceKeyHash = crypto
      .createHash('sha256')
      .update('device-a|tls-a|ua-a|127.0.0.1')
      .digest('hex');
    mocks.refreshFindUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'admin-1',
      jti: 'jti-1',
      sessionId: 'session-1',
      tokenHash: bcrypt.hashSync(refreshToken, 10),
      deviceKeyHash,
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    });
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      phone: null,
      passwordHash: bcrypt.hashSync('password-123', 10),
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      isVerified: true
    });
    const service = new AuthService(fastify);

    const result = await service.refresh(refreshToken, {
      clientIp: '127.0.0.1',
      risk: { sessionId: 'session-1', deviceFingerprint: 'device-a', tlsFingerprint: 'tls-a', userAgent: 'ua-a' }
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(mocks.refreshUpdate).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { consumedAt: expect.any(Date) }
    });
    expect(mocks.refreshCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'session-1',
          deviceKeyHash
        })
      })
    );
  });

  it('revokes all active sessions when logout is called without refresh token', async () => {
    const { fastify, mocks } = createFastifyMock();
    const service = new AuthService(fastify);
    const result = await service.logout('admin-1');
    expect(result.message).toContain('Logged out');
    expect(mocks.refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'admin-1',
          revokedAt: null
        })
      })
    );
  });
});
