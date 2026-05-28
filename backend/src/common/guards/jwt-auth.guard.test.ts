import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtAuthGuard } from './jwt-auth.guard';

function buildRequest(input: {
  verifyResult?: { sub: string; role: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] };
  verifyThrows?: boolean;
  adminUser?: { id: string; role: 'CUSTOMER' | 'ADMIN'; isBanned: boolean } | null;
}) {
  const findUnique = vi.fn(async () => input.adminUser ?? null);
  const request = {
    jwtVerify: input.verifyThrows
      ? vi.fn(async () => {
          throw new Error('invalid');
        })
      : vi.fn(async () => input.verifyResult ?? { sub: 'user_1', role: 'CUSTOMER' as const }),
    server: {
      prisma: {
        user: { findUnique }
      }
    }
  } as unknown as FastifyRequest;

  return { request, findUnique };
}

describe('jwtAuthGuard', () => {
  it('throws when JWT verification fails', async () => {
    const { request } = buildRequest({ verifyThrows: true });
    await expect(jwtAuthGuard(request, {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it('does not query DB for non-admin roles', async () => {
    const { request, findUnique } = buildRequest({
      verifyResult: { sub: 'customer_1', role: 'CUSTOMER' }
    });

    await expect(jwtAuthGuard(request, {} as FastifyReply)).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects banned admin users', async () => {
    const { request } = buildRequest({
      verifyResult: { sub: 'admin_1', role: 'ADMIN' },
      adminUser: { id: 'admin_1', role: 'ADMIN', isBanned: true }
    });

    await expect(jwtAuthGuard(request, {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it('allows active admins', async () => {
    const { request } = buildRequest({
      verifyResult: { sub: 'admin_1', role: 'ADMIN' },
      adminUser: { id: 'admin_1', role: 'ADMIN', isBanned: false }
    });

    await expect(jwtAuthGuard(request, {} as FastifyReply)).resolves.toBeUndefined();
  });
});
