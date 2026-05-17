import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerSettingsRoutes } from './settings.routes';

// Define mock types for test fixtures
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
      permissions: ['settings:read', 'settings:write']
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
  const storeSettingsFindUnique = vi.fn(async () => ({
    pickupPincode: '522006',
    minOrderValuePaise: 10000,
    defaultLowStockThreshold: 7,
    storeName: 'Test Store',
    notifyEmailEnabled: true
  }));
  const storeSettingsUpsert = vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
    ...args.create,
    ...args.update
  }));
  app.decorate('prisma', {
    storeSettings: {
      findUnique: storeSettingsFindUnique,
      upsert: storeSettingsUpsert
    }
  } as unknown as Parameters<typeof app.decorate>[1] & { storeSettings: unknown });
  return app;
}

describe('settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves shipping and inventory settings routes', async () => {
    const app = createApp();
    await registerSettingsRoutes(app);

    const shippingGet = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/shipping',
      headers: { authorization: 'Bearer token' }
    });
    expect(shippingGet.statusCode).toBe(200);

    const shippingPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings/shipping',
      headers: { authorization: 'Bearer token' },
      payload: {
        pickupPincode: '560001',
        minOrderValuePaise: 15000
      }
    });
    expect(shippingPatch.statusCode).toBe(200);

    const inventoryGet = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/inventory',
      headers: { authorization: 'Bearer token' }
    });
    expect(inventoryGet.statusCode).toBe(200);

    const inventoryPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings/inventory',
      headers: { authorization: 'Bearer token' },
      payload: {
        defaultLowStockThreshold: 10
      }
    });
    expect(inventoryPatch.statusCode).toBe(200);

    await app.close();
  });
});
