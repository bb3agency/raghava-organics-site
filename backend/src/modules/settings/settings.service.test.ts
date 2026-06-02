import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SettingsService } from './settings.service';



describe('SettingsService', () => {
  it('returns database pickup pincode when persisted setting exists', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            pickupPincode: '500001',
            minOrderValuePaise: 15000
          })
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);

    await expect(service.getShippingSettings()).resolves.toEqual({
      pickupPincode: '500001',
      minOrderValuePaise: 15000,
      source: 'database'
    });
  });

  it('returns template defaults when shipping is not configured yet', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue(null)
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);

    await expect(service.getShippingSettings()).resolves.toEqual({
      pickupPincode: '500001',
      minOrderValuePaise: 0,
      source: 'default'
    });
  });

  it('updates pickup pincode through singleton upsert', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          upsert: vi.fn().mockResolvedValue({
            pickupPincode: '560001',
            minOrderValuePaise: 12000
          })
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);

    await expect(service.updateShippingSettings({ pickupPincode: '560001', minOrderValuePaise: 12000 })).resolves.toEqual({
      pickupPincode: '560001',
      minOrderValuePaise: 12000,
      source: 'database'
    });
  });
});

describe('SettingsService — COD settings', () => {
  it('getCodSettings returns stored values', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            isCodEnabled: true,
            cancellationWindowHours: 48,
            sellerState: 'Telangana'
          })
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);
    const result = await service.getCodSettings();
    expect(result.isCodEnabled).toBe(true);
    expect(result.cancellationWindowHours).toBe(48);
    expect(result.sellerState).toBe('Telangana');
  });

  it('getCodSettings returns safe defaults when no record exists', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue(null)
        }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);
    const result = await service.getCodSettings();
    expect(result.isCodEnabled).toBe(false);
    expect(result.cancellationWindowHours).toBe(24);
    expect(result.sellerState).toBeNull();
  });

  it('updateCodSettings upserts with provided values', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      isCodEnabled: true,
      cancellationWindowHours: 12,
      sellerState: 'Karnataka'
    });
    const fastify = {
      prisma: {
        storeSettings: { upsert: upsertMock }
      }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);
    const result = await service.updateCodSettings({ isCodEnabled: true, cancellationWindowHours: 12, sellerState: 'Karnataka' });
    expect(result.isCodEnabled).toBe(true);
    expect(result.cancellationWindowHours).toBe(12);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it('updateCodSettings enforces minimum cancellationWindowHours of 1', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      isCodEnabled: false,
      cancellationWindowHours: 1,
      sellerState: null
    });
    const fastify = {
      prisma: { storeSettings: { upsert: upsertMock } }
    } as unknown as FastifyInstance;
    const service = new SettingsService(fastify);
    await service.updateCodSettings({ cancellationWindowHours: 0 }); // 0 should be floored to 1
    const upsertArg = upsertMock.mock.calls[0]?.[0] as { update: Record<string, unknown> } | undefined;
    expect(upsertArg?.update['cancellationWindowHours']).toBe(1);
  });
});
