import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service';

describe('CartService mergeGuestCart coupon preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves guest coupon to user cart when valid', async () => {
    const coupon = {
      id: 'coupon_1',
      code: 'WELCOME10',
      type: 'PERCENTAGE_OFF',
      value: 10,
      minOrderPaise: 0,
      maxUsesTotal: null,
      maxUsesPerUser: null,
      usesCount: 0,
      isActive: true,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: new Date('2026-12-31T23:59:59.000Z'),
      applicableTo: null
    };

    const tx = {
      cart: {
        upsert: vi.fn().mockResolvedValue({ id: 'user_cart_1', couponId: null }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'guest_cart_1',
          couponId: 'coupon_1',
          coupon,
          items: [
            {
              variantId: 'variant_1',
              quantity: 1,
              priceSnapshot: 1000
            }
          ]
        }),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'user_cart_1',
            sessionToken: null,
            coupon,
            items: [
              {
                id: 'item_1',
                variantId: 'variant_1',
                quantity: 1,
                priceSnapshot: 1000,
                variant: {
                  id: 'variant_1',
                  name: 'Variant 1',
                  sku: 'SKU-1',
                  price: 1000,
                  productId: 'product_1',
                  product: { categoryId: 'category_1' }
                }
              }
            ]
          })
          .mockResolvedValueOnce({
            id: 'user_cart_1',
            sessionToken: null,
            coupon,
            items: []
          })
      },
      cartItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      order: {
        count: vi.fn().mockResolvedValue(0)
      }
    };

    const fastify = {
      prisma: {
        order: {
          count: vi.fn().mockResolvedValue(0)
        },
        $transaction: vi.fn().mockImplementation(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx))
      }
    } as unknown as FastifyInstance;

    const service = new CartService(fastify);
    await service.mergeGuestCart('user_1', 'session_1');

    expect(tx.cart.update).toHaveBeenCalledWith({
      where: { id: 'user_cart_1' },
      data: { couponId: 'coupon_1' }
    });
  });
});
