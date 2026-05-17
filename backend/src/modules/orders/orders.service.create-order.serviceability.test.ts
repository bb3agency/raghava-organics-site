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

  it('fetches delivery rate before entering order transaction', async () => {
    vi.spyOn(CartService.prototype, 'checkPincodeServiceability').mockResolvedValue({
      pincode: '500001',
      serviceable: true
    });
    const getDeliveryRatesSpy = vi.spyOn(CartService.prototype, 'getDeliveryRates').mockResolvedValue({
      pincode: '500001',
      shippingCharge: 4500,
      estimatedDays: 3
    });

    const transactionSpy = vi.fn().mockRejectedValue(new Error('stop-after-precheck'));
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

    await expect(service.createOrder('user_1', { addressId: 'address_1' })).rejects.toThrow('stop-after-precheck');
    expect(getDeliveryRatesSpy).toHaveBeenCalledWith('user_1', undefined, '500001');
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });
});
