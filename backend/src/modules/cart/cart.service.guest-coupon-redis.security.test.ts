import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service';

describe('CartService guest coupon Redis keys (v2 hashed)', () => {
  const sessionToken = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const originalRedisKeyPepper = process.env.REDIS_KEY_PEPPER;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.REDIS_KEY_PEPPER = 'pepper-for-tests';
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalRedisKeyPepper === undefined) {
      delete process.env.REDIS_KEY_PEPPER;
    } else {
      process.env.REDIS_KEY_PEPPER = originalRedisKeyPepper;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('builds v2 keys without embedding the raw session token', () => {
    const service = new CartService({} as never);
    const key = (
      service as unknown as { getGuestCouponUsageKeyV2: (c: string, s: string) => string }
    ).getGuestCouponUsageKeyV2('coupon_1', sessionToken);

    expect(key).toMatch(/^coupon:guest-uses:v2:coupon_1:[a-f0-9]{24}$/);
    expect(key).not.toContain(sessionToken);
  });

  it('migrates legacy v1 Redis value to v2 and removes v1', async () => {
    const couponId = 'coupon_1';
    const v1Key = `coupon:guest-uses:${couponId}:${sessionToken}`;
    const service = new CartService({} as never);
    const v2Key = (service as unknown as { getGuestCouponUsageKeyV2: (c: string, s: string) => string }).getGuestCouponUsageKeyV2(
      couponId,
      sessionToken
    );

    const store = new Map<string, string>([[v1Key, '2']]);
    const redis = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (k: string) => {
        store.delete(k);
        return 1;
      }),
      incr: vi.fn(),
      expire: vi.fn()
    };

    const fastify = { redis, prisma: {}, log: { error: vi.fn() } };
    const svc = new CartService(fastify as never);

    await (svc as unknown as { migrateGuestCouponUsageKeysIfNeeded: (c: string, s: string) => Promise<void> }).migrateGuestCouponUsageKeysIfNeeded(
      couponId,
      sessionToken
    );

    expect(store.has(v1Key)).toBe(false);
    expect(store.get(v2Key)).toBe('2');
    expect(redis.set).toHaveBeenCalledWith(v2Key, '2', 'EX', expect.any(Number));
  });
});
