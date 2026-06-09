import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { featureFlags } from '@config/feature-flags';
import { CartService } from './cart.service';

describe('CartService removeCoupon', () => {
  const originalCouponsFlag = featureFlags.coupons;

  afterEach(() => {
    featureFlags.coupons = originalCouponsFlag;
  });

  it('clears coupon even when coupons feature flag is disabled', async () => {
    featureFlags.coupons = false;
    const update = vi.fn().mockResolvedValue(undefined);
    const cartRecord = {
      id: 'cart_1',
      sessionToken: null,
      coupon: {
        id: 'coupon_1',
        code: 'SAVE10',
        type: 'PERCENTAGE_OFF',
        value: 10
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
          upsert: vi.fn().mockResolvedValue({ id: 'cart_1' }),
          update,
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValueOnce(cartRecord)
            .mockResolvedValueOnce({ ...cartRecord, coupon: null })
        }
      }
    } as unknown as FastifyInstance;
    const service = new CartService(fastify);

    const result = await service.removeCoupon('user_1', undefined);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cart_1' },
      data: { couponId: null }
    });
    expect(result.coupon).toBeNull();
    expect(result.discountAmount).toBe(0);
  });
});
