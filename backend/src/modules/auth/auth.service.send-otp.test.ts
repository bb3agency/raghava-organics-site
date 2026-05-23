import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';

describe('AuthService sendOtp', () => {
  it('requires challenge token when turnstile secret is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    const redisGet = vi.fn().mockResolvedValue(null);
    const redisSet = vi.fn().mockResolvedValue('OK');
    const fastify = {
      redis: {
        get: redisGet,
        set: redisSet,
        ttl: vi.fn().mockResolvedValue(-1),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1)
      },
      queues: {
        notifications: {
          add: vi.fn().mockResolvedValue(undefined)
        }
      },
      prisma: {
        user: {
          findFirst: vi.fn().mockResolvedValue(null)
        },
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ storeName: 'Test Store' })
        }
      }
    } as unknown as FastifyInstance;
    const service = new AuthService(fastify);
    await expect(
      service.sendOtp(
        { phone: '9876543210' },
        { clientIp: '127.0.0.1', risk: { sessionId: 's-1', deviceFingerprint: 'd-1' } }
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400
    });
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('enqueues OTP via send-primary when cooldown and attempts allow', async () => {
    const redisGet = vi.fn().mockResolvedValue(null);
    const redisSet = vi.fn().mockResolvedValue('OK');
    const notificationsAdd = vi.fn().mockResolvedValue(undefined);

    const fastify = {
      redis: {
        get: redisGet,
        set: redisSet,
        ttl: vi.fn().mockResolvedValue(-1),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1)
      },
      queues: {
        notifications: {
          add: notificationsAdd
        }
      },
      prisma: {
        user: {
          findFirst: vi.fn().mockResolvedValue({ email: 'customer@example.com' })
        },
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ storeName: 'Acme Shop' })
        }
      }
    } as unknown as FastifyInstance;

    const service = new AuthService(fastify);
    const result = await service.sendOtp(
      { phone: '9876543210', turnstileToken: 'token-ok' },
      { clientIp: '127.0.0.1', risk: { sessionId: 's-1' } }
    );

    expect(result).toEqual({ message: 'OTP sent successfully' });
    expect(redisSet).toHaveBeenCalledWith('otp:9876543210', expect.any(String), 'EX', 300);
    expect(redisSet).toHaveBeenCalledWith('otp:cooldown:9876543210', '1', 'EX', 60);
    expect(notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        email: 'customer@example.com',
        phone: '9876543210',
        template: 'CustomerOtpVerification',
        data: expect.objectContaining({
          otp: expect.any(String),
          storeName: 'Acme Shop'
        })
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('otp:9876543210:')
      })
    );
  });

  it('uses Our Store fallback when storeSettings is missing', async () => {
    const notificationsAdd = vi.fn().mockResolvedValue(undefined);
    const fastify = {
      redis: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(-1),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1)
      },
      queues: { notifications: { add: notificationsAdd } },
      prisma: {
        user: { findFirst: vi.fn().mockResolvedValue(null) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue(null) }
      }
    } as unknown as FastifyInstance;

    const service = new AuthService(fastify);
    await service.sendOtp({ phone: '9876543210' });

    expect(notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        template: 'CustomerOtpVerification',
        data: expect.objectContaining({ storeName: 'Our Store' })
      }),
      expect.any(Object)
    );
  });

  it('cleans redis OTP keys and throws when OTP enqueue fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', fetchMock);
    const redisGet = vi.fn().mockResolvedValue(null);
    const redisSet = vi.fn().mockResolvedValue('OK');
    const redisDel = vi.fn().mockResolvedValue(2);
    const notificationsAdd = vi.fn().mockRejectedValue(new Error('queue down'));

    const fastify = {
      redis: {
        get: redisGet,
        set: redisSet,
        del: redisDel,
        ttl: vi.fn().mockResolvedValue(-1),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1)
      },
      queues: {
        notifications: {
          add: notificationsAdd
        }
      },
      prisma: {
        user: {
          findFirst: vi.fn().mockResolvedValue(null)
        },
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ storeName: 'Test Store' })
        }
      }
    } as unknown as FastifyInstance;

    const service = new AuthService(fastify);

    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    await expect(service.sendOtp({ phone: '9876543210', turnstileToken: 'ok-token' }, { clientIp: '127.0.0.1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 502
    });
    expect(redisDel).toHaveBeenCalledWith(
      'otp:9876543210',
      expect.stringContaining('otp:cooldown:9876543210'),
      'otp:cooldown:9876543210'
    );
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.unstubAllGlobals();
  });
});
