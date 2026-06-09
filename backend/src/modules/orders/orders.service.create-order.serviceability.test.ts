import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { OrdersService } from './orders.service';
import { CartService } from '@modules/cart/cart.service';

describe('OrdersService createOrder serviceability enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects order creation when shipping pincode is unserviceable', async () => {
    vi.spyOn(CartService.prototype, 'checkPincodeServiceability').mockResolvedValue({
      pincode: '500001',
      serviceable: false
    });

    const transactionSpy = vi.fn();
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            minOrderValuePaise: 0
          })
        },
        address: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'address_1',
            pincode: '500001'
          })
        },
        $transaction: transactionSpy
      },
      log: {
        error: vi.fn(),
        warn: vi.fn()
      },
      queues: {
        analytics: { add: vi.fn() },
        shipping: { add: vi.fn() },
        orderProcessing: { add: vi.fn() },
        refunds: { add: vi.fn() },
        notifications: { add: vi.fn() }
      },
      redis: {
        set: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);

    await expect(service.createOrder('user_1', { addressId: 'address_1' })).rejects.toMatchObject({
      code: 'PINCODE_NOT_SERVICEABLE',
      statusCode: 422
    });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('computes delivery rate inside order transaction', async () => {
    vi.spyOn(CartService.prototype, 'checkPincodeServiceability').mockResolvedValue({
      pincode: '500001',
      serviceable: true
    });
    const computeShippingSpy = vi.spyOn(CartService.prototype, 'computeShippingChargeForCart').mockResolvedValue({
      shippingChargePaise: 4500,
      estimatedDays: 3
    });

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1n }]),
      storeSettings: {
        findUnique: vi.fn().mockResolvedValue({
          minOrderValuePaise: 0,
          pickupPincode: '500001'
        })
      },
      cart: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cart_1',
          coupon: null,
          reservations: [],
          items: [
            {
              variantId: 'variant_1',
              quantity: 1,
              priceSnapshot: 10000,
              variant: {
                id: 'variant_1',
                inventory: { quantity: 10 },
                product: { categoryId: 'category_1', name: 'Product 1' }
              }
            }
          ]
        })
      },
      order: {
        create: vi.fn().mockRejectedValue(new Error('stop-after-precheck'))
      }
    };
    const transactionSpy = vi.fn().mockImplementation(async (fn: (arg0: typeof tx) => Promise<unknown>) => fn(tx));
    const fastify = {
      prisma: {
        order: {
          count: vi.fn().mockResolvedValue(0)
        },
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            minOrderValuePaise: 0
          })
        },
        address: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'address_1',
            userId: 'user_1',
            fullName: 'Test User',
            phone: '9999999999',
            line1: 'Street 1',
            city: 'Hyderabad',
            state: 'Telangana',
            pincode: '500001'
          })
        },
        $transaction: transactionSpy
      },
      log: {
        error: vi.fn(),
        warn: vi.fn()
      },
      queues: {
        analytics: { add: vi.fn() },
        shipping: { add: vi.fn() },
        orderProcessing: { add: vi.fn() },
        refunds: { add: vi.fn() },
        notifications: { add: vi.fn() }
      },
      redis: {
        set: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);

    await expect(service.createOrder('user_1', { addressId: 'address_1' })).rejects.toThrow('stop-after-precheck');
    expect(computeShippingSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });
});
