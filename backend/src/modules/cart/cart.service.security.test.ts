import { describe, expect, it } from 'vitest';
import { CartService } from './cart.service';

describe('CartService secure response contracts', () => {
  it('does not expose cart session token in customer response metadata', () => {
    const service = new CartService({} as never);
    const result = (service as unknown as { serializeCart: (cart: unknown, isGuest: boolean) => Record<string, unknown> })
      .serializeCart(
        {
          id: 'cart_1',
          sessionToken: 'session_abc',
          coupon: null,
          reservations: [],
          items: []
        },
        true
      );

    expect(result.meta).toEqual(
      expect.objectContaining({
        isGuest: true,
        reservationExpiresAt: null,
        reservedItemCount: 0
      })
    );
    expect(result.meta).not.toHaveProperty('sessionToken');
  });
});
