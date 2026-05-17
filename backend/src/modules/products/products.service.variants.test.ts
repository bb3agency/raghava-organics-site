import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ProductsService } from './products.service';

describe('ProductsService variant management', () => {
  it('creates product variant with inventory default threshold', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            defaultLowStockThreshold: 8
          })
        },
        product: {
          findUnique: vi.fn().mockResolvedValue({ id: 'prod_1' })
        },
        productVariant: {
          create: vi.fn().mockResolvedValue({ id: 'variant_1', sku: 'SKU-1' })
        }
      },
      redis: {
        scan: vi.fn().mockResolvedValue(['0', []]),
        del: vi.fn().mockResolvedValue(0)
      },
      queues: {
        analytics: {
          add: vi.fn()
        }
      },
      log: {
        error: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new ProductsService(fastify);
    const created = await service.adminCreateProductVariant('prod_1', {
      sku: 'SKU-1',
      name: 'Variant 1',
      price: 1000
    });

    expect(created.id).toBe('variant_1');
    expect(fastify.prisma.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventory: {
            create: expect.objectContaining({
              lowStockThreshold: 8
            })
          }
        })
      })
    );
  });

  it('rejects compareAtPrice less than or equal to price', async () => {
    const fastify = {
      prisma: {
        storeSettings: {
          findUnique: vi.fn().mockResolvedValue({
            defaultLowStockThreshold: 5
          })
        },
        product: {
          findUnique: vi.fn().mockResolvedValue({ id: 'prod_1' })
        },
        productVariant: {
          create: vi.fn()
        }
      },
      redis: {
        scan: vi.fn().mockResolvedValue(['0', []]),
        del: vi.fn().mockResolvedValue(0)
      },
      queues: {
        analytics: {
          add: vi.fn()
        }
      },
      log: {
        error: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new ProductsService(fastify);
    await expect(
      service.adminCreateProductVariant('prod_1', {
        sku: 'SKU-1',
        name: 'Variant 1',
        price: 1000,
        compareAtPrice: 1000
      })
    ).rejects.toMatchObject({
      statusCode: 400
    });
  });
});
