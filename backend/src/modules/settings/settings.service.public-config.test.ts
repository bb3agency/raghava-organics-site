import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { featureFlags } from '@config/feature-flags';
import { SettingsService } from './settings.service';

describe('SettingsService getPublicStoreConfig', () => {
  const originalFlags = {
    coupons: featureFlags.coupons,
    reviews: featureFlags.reviews,
    wishlist: featureFlags.wishlist,
    gstInvoicing: featureFlags.gstInvoicing
  };

  afterEach(() => {
    featureFlags.coupons = originalFlags.coupons;
    featureFlags.reviews = originalFlags.reviews;
    featureFlags.wishlist = originalFlags.wishlist;
    featureFlags.gstInvoicing = originalFlags.gstInvoicing;
  });

  it('returns store settings and runtime feature flags for the storefront', async () => {
    featureFlags.coupons = true;
    featureFlags.reviews = false;
    featureFlags.wishlist = true;
    featureFlags.gstInvoicing = false;

    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            isCodEnabled: true,
            minOrderValuePaise: 25000,
            mobileOtpSignupEnabled: true
          })
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);

    await expect(service.getPublicStoreConfig()).resolves.toEqual({
      isCodEnabled: true,
      minOrderValuePaise: 25000,
      mobileOtpSignupEnabled: true,
      couponsEnabled: true,
      reviewsEnabled: false,
      wishlistEnabled: true,
      gstInvoicingEnabled: false
    });
  });
});
