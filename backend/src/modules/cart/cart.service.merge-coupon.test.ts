import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '@config/feature-flags';
import { CartService } from './cart.service';

describe('CartService mergeGuestCart coupon preservation', () => {
  const originalCouponsFlag = featureFlags.coupons;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlags.coupons = true;
  });

  afterEach(() => {
    featureFlags.coupons = originalCouponsFlag;
  });

  function buildHarness() {
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
          sessionToken: 'session_1',
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
      redis: {
        get: vi.fn().mockResolvedValue('1'),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1)
      },
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 })
        },
        order: {
          count: vi.fn().mockResolvedValue(0)
        },
        $transaction: vi.fn().mockImplementation(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx))
      }
    } as unknown as FastifyInstance;

    return { service: new CartService(fastify), tx, fastify };
  }

  it('moves guest coupon to user cart when valid and coupons are enabled', async () => {
    const { service, tx } = buildHarness();
    await service.mergeGuestCart('user_1', 'session_1');

    expect(tx.cart.update).toHaveBeenCalledWith({
      where: { id: 'user_cart_1' },
      data: { couponId: 'coupon_1' }
    });
  });

  it('does not attach guest coupon when coupons feature flag is disabled', async () => {
    featureFlags.coupons = false;
    const { service, tx } = buildHarness();
    await service.mergeGuestCart('user_1', 'session_1');

    expect(tx.cart.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { couponId: 'coupon_1' }
      })
    );
  });

  it('releases guest coupon redis usage when guest cart is deleted during merge', async () => {
    const { service, fastify } = buildHarness();
    const guestCart = {
      id: 'guest_cart_1',
      sessionToken: 'session_1',
      couponId: 'coupon_1',
      coupon: {
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
      },
      items: [{ variantId: 'variant_1', quantity: 1, priceSnapshot: 1000 }]
    };
    fastify.prisma.$transaction = vi.fn().mockImplementation(async (fn) => {
      const tx = {
        cart: {
          upsert: vi.fn().mockResolvedValue({ id: 'user_cart_1', couponId: null }),
          findUnique: vi.fn().mockResolvedValue(guestCart),
          update: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 'user_cart_1',
            userId: 'user_1',
            sessionToken: null,
            coupon: guestCart.coupon,
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
        },
        cartItem: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(undefined)
        },
        order: { count: vi.fn().mockResolvedValue(0) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) }
      };
      return fn(tx);
    });

    await service.mergeGuestCart('user_1', 'session_1');

    expect(fastify.redis.del).toHaveBeenCalled();
  });
});
