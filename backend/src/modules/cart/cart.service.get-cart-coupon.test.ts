import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { featureFlags } from '@config/feature-flags';
import { CartService } from './cart.service';

describe('CartService getCart stale coupon cleanup', () => {
  const originalCouponsFlag = featureFlags.coupons;

  afterEach(() => {
    featureFlags.coupons = originalCouponsFlag;
  });

  it('clears orphaned couponId from DB when coupons feature flag is disabled', async () => {
    featureFlags.coupons = false;
    const update = vi.fn().mockResolvedValue(undefined);
    const cartRecord = {
      id: 'cart_1',
      sessionToken: null,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
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
      reservations: [],
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
    };
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 })
        },
        cart: {
          upsert: vi.fn().mockResolvedValue(cartRecord),
          update
        },
        cartReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as unknown as FastifyInstance;
    const service = new CartService(fastify);

    const result = await service.getCart('user_1', undefined);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cart_1' },
      data: { couponId: null }
    });
    expect(result.coupon).toBeNull();
    expect(result.discountAmount).toBe(0);
  });

  it('clears expired coupon on cart read and returns zero discount', async () => {
    featureFlags.coupons = true;
    const update = vi.fn().mockResolvedValue(undefined);
    const expiredCoupon = {
      id: 'coupon_1',
      code: 'SAVE10',
      type: 'PERCENTAGE_OFF',
      value: 10,
      minOrderPaise: 0,
      maxUsesTotal: null,
      maxUsesPerUser: null,
      usesCount: 0,
      isActive: true,
      validFrom: new Date('2024-01-01T00:00:00.000Z'),
      validUntil: new Date('2024-12-31T23:59:59.000Z'),
      applicableTo: null
    };
    const cartRecord = {
      id: 'cart_1',
      userId: 'user_1',
      sessionToken: null,
      coupon: expiredCoupon,
      reservations: [],
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
    };
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 })
        },
        cart: {
          upsert: vi.fn().mockResolvedValue(cartRecord),
          update
        },
        order: {
          count: vi.fn().mockResolvedValue(0)
        },
        cartReservation: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as unknown as FastifyInstance;
    const service = new CartService(fastify);

    const result = await service.getCart('user_1', undefined);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cart_1' },
      data: { couponId: null }
    });
    expect(result.coupon).toBeNull();
    expect(result.discountAmount).toBe(0);
  });
});
