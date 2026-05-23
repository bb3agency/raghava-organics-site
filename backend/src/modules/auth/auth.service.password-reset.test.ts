import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';

describe('AuthService requestPasswordReset', () => {
  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('enqueues PasswordReset email when user exists', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const findUnique = vi.fn().mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com'
    });

    const fastify = {
      prisma: {
        user: { findUnique }
      },
      queues: {
        notifications: { add }
      },
      redis: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(-1)
      }
    } as unknown as FastifyInstance;

    const service = new AuthService(fastify);
    const result = await service.requestPasswordReset({ email: 'user@example.com' });

    expect(result.message).toContain('If the account exists');
    expect(add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'user@example.com',
        template: 'PasswordReset',
        data: expect.objectContaining({
          email: 'user@example.com',
          userId: 'user_1'
        })
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('password-reset:user_1:')
      })
    );
  });
});
