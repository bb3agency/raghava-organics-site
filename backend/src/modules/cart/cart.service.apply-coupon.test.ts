import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '@config/feature-flags';
import { CartService } from './cart.service';

describe('CartService applyCoupon feature flag', () => {
  const originalCouponsFlag = featureFlags.coupons;

  beforeEach(() => {
    featureFlags.coupons = false;
  });

  afterEach(() => {
    featureFlags.coupons = originalCouponsFlag;
  });

  it('rejects applyCoupon when coupons feature flag is disabled', async () => {
    const fastify = {
      prisma: {
        cart: {
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn()
        },
        cartItem: { findMany: vi.fn() }
      }
    } as unknown as FastifyInstance;

    const service = new CartService(fastify);
    await expect(
      service.applyCoupon('user_1', undefined, { code: 'SAVE10' })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Coupons are disabled'
    });
  });
});
