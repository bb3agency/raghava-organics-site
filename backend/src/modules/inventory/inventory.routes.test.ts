import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerInventoryRoutes } from './inventory.routes';

interface MockError {
  statusCode?: number;
  code?: string;
  message?: string;
}

function createApp() {
  const app = Fastify();
  app.decorateRequest('jwtVerify', async function () {
    (this as unknown as { user: unknown }).user = {
      sub: 'user-1',
      role: 'ADMIN',
      permissions: ['inventory:read', 'inventory:write']
    };
  });
  app.setErrorHandler((err, _request, reply) => {
    const error = err as MockError;
    reply.status(error.statusCode ?? 500).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: error.message,
        statusCode: error.statusCode ?? 500,
        details: { kind: 'internal', hintKey: 'unknown', retryable: false, remediation: '' }
      }
    });
  });
  app.decorate('prisma', {
    $transaction: vi.fn(async (queries: any[]) => Promise.all(queries)),
    inventory: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({}))
    },
    cartReservation: {
      groupBy: vi.fn(async () => [])
    }
  } as unknown as NonNullable<Parameters<typeof app.decorate>[1]>);
  return app;
}

describe('inventory routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves inventory list route', async () => {
    const app = createApp();
    await registerInventoryRoutes(app);

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/inventory',
      headers: { authorization: 'Bearer token' }
    });
    expect(getResponse.statusCode).toBe(200);

    await app.close();
  });
});
