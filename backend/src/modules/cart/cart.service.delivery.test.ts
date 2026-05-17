import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CartService } from './cart.service';

const DELHIVERY_TEST_BASE_URL = 'https://delhivery.test/api';

describe('CartService delivery utility methods', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns serviceability from provider when Delhivery key is configured', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', 'delhivery_key');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '110001');
    vi.stubEnv('DELHIVERY_BASE_URL', DELHIVERY_TEST_BASE_URL);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ delivery_codes: [{ postal_code: { pin: '500001' } }] })
      })
    );
    const service = new CartService({ log: { warn: vi.fn() } } as unknown as FastifyInstance);
    await expect(service.checkPincodeServiceability('500001')).resolves.toEqual({
      pincode: '500001',
      serviceable: true
    });
  });

  it('falls back to noop serviceability when shipping provider is not configured', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', '');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '');
    vi.stubEnv('DELHIVERY_BASE_URL', '');
    const service = new CartService({} as FastifyInstance);
    await expect(service.checkPincodeServiceability('500001')).resolves.toEqual({
      pincode: '500001',
      serviceable: true
    });
  });

  it('throws when provider serviceability check fails', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', 'delhivery_key');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '110001');
    vi.stubEnv('DELHIVERY_BASE_URL', DELHIVERY_TEST_BASE_URL);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => ''
      })
    );
    const warn = vi.fn();
    const service = new CartService({ log: { warn } } as unknown as FastifyInstance);
    await expect(service.checkPincodeServiceability('500001')).rejects.toMatchObject({
      statusCode: 503
    });
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to noop delivery rates when shipping provider is not configured', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', '');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '');
    vi.stubEnv('DELHIVERY_BASE_URL', '');
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue(null)
        },
        cart: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cart_1',
            items: [
              {
                quantity: 1,
                variant: {
                  weight: 500
                }
              }
            ]
          })
        }
      }
    } as unknown as FastifyInstance;
    const service = new CartService(fastify);
    await expect(service.getDeliveryRates('user_1', undefined, '500001')).resolves.toEqual({
      pincode: '500001',
      shippingCharge: 0,
      estimatedDays: 3
    });
  });

  it('throws validation error when delivery rates are requested without cart items', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue(null)
        },
        cart: {
          findUnique: vi.fn().mockResolvedValue(null)
        }
      }
    } as unknown as FastifyInstance;

    const service = new CartService(fastify);
    await expect(service.getDeliveryRates('user_1', undefined, '500001')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400
    });
  });

  it('returns computed delivery rate for serviceable pincode', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', 'delhivery_key');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '110001');
    vi.stubEnv('DELHIVERY_BASE_URL', DELHIVERY_TEST_BASE_URL);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ delivery_codes: [{ postal_code: { pin: '500001' } }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ total_amount: 99.5, estimated_delivery_days: 3 })
      });
    vi.stubGlobal('fetch', fetchMock);

    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            pickupPincode: '110001'
          })
        },
        cart: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cart_1',
            items: [
              {
                quantity: 2,
                variant: {
                  weight: 750
                }
              }
            ]
          })
        }
      }
    } as unknown as FastifyInstance;

    const service = new CartService(fastify);
    await expect(service.getDeliveryRates('user_1', undefined, '500001')).resolves.toEqual({
      pincode: '500001',
      shippingCharge: 9950,
      estimatedDays: 3
    });
  });

  it('rejects delivery-rate request for unserviceable pincode', async () => {
    vi.stubEnv('DELHIVERY_API_KEY', 'delhivery_key');
    vi.stubEnv('DELHIVERY_PICKUP_PINCODE', '110001');
    vi.stubEnv('DELHIVERY_BASE_URL', DELHIVERY_TEST_BASE_URL);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ delivery_codes: [] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            pickupPincode: '110001'
          })
        },
        cart: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cart_1',
            items: [
              {
                quantity: 1,
                variant: {
                  weight: 500
                }
              }
            ]
          })
        }
      }
    } as unknown as FastifyInstance;

    const service = new CartService(fastify);
    await expect(service.getDeliveryRates('user_1', undefined, '500001')).rejects.toMatchObject({
      code: 'PINCODE_NOT_SERVICEABLE',
      statusCode: 422
    });
  });
});
