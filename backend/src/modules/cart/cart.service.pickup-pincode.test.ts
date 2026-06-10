import { afterEach, describe, expect, it } from 'vitest';
import { featureFlags } from '@config/feature-flags';
import { CartService } from './cart.service';

describe('CartService serializeCart coupon feature flag', () => {
  const originalCouponsFlag = featureFlags.coupons;

  afterEach(() => {
    featureFlags.coupons = originalCouponsFlag;
  });

  it('hides coupon and discount when coupons feature flag is disabled', () => {
    featureFlags.coupons = false;
    const service = new CartService({} as never);
    const result = (
      service as unknown as { serializeCart: (cart: unknown, isGuest: boolean) => Record<string, unknown> }
    ).serializeCart(
      {
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
              product: {
                categoryId: 'category_1',
                name: 'Product 1',
                metaDescription: 'Short description',
                images: [{ url: '/api/v1/media/products/product_1/hero.webp', altText: 'Product 1' }]
              }
            }
          }
        ]
      },
      false
    );

    expect(result.coupon).toBeNull();
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(1000);
  });
});
