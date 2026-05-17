import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { InventoryService } from './inventory.service';

describe('InventoryService updateInventory low-stock alert reset', () => {
  it('resets lowStockAlerted when restocked above threshold', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'inv_1',
      variantId: 'variant_1',
      quantity: 2,
      lowStockThreshold: 5,
      lowStockAlerted: true
    });
    const update = vi.fn().mockResolvedValue({
      id: 'inv_1',
      variantId: 'variant_1',
      quantity: 10,
      lowStockThreshold: 5,
      lowStockAlerted: false,
      variant: {
        id: 'variant_1',
        name: 'Variant 1',
        sku: 'SKU-1',
        product: {
          id: 'prod_1',
          name: 'Product 1',
          slug: 'product-1'
        }
      }
    });

    const fastify = {
      prisma: {
        inventory: {
          findUnique,
          update
        }
      },
      redis: {
        scan: vi.fn().mockResolvedValue(['0', []]),
        del: vi.fn().mockResolvedValue(0)
      },
      log: {
        error: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new InventoryService(fastify);
    await service.updateInventory('variant_1', { quantity: 10 });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 10,
          lowStockAlerted: false
        })
      })
    );
  });

  it('does not reset lowStockAlerted when stock remains at or below threshold', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'inv_1',
      variantId: 'variant_1',
      quantity: 2,
      lowStockThreshold: 5,
      lowStockAlerted: true
    });
    const update = vi.fn().mockResolvedValue({
      id: 'inv_1',
      variantId: 'variant_1',
      quantity: 5,
      lowStockThreshold: 5,
      lowStockAlerted: true,
      variant: {
        id: 'variant_1',
        name: 'Variant 1',
        sku: 'SKU-1',
        product: {
          id: 'prod_1',
          name: 'Product 1',
          slug: 'product-1'
        }
      }
    });

    const fastify = {
      prisma: {
        inventory: {
          findUnique,
          update
        }
      },
      redis: {
        scan: vi.fn().mockResolvedValue(['0', []]),
        del: vi.fn().mockResolvedValue(0)
      },
      log: {
        error: vi.fn()
      }
    } as unknown as FastifyInstance;

    const service = new InventoryService(fastify);
    await service.updateInventory('variant_1', { quantity: 5 });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          lowStockAlerted: false
        })
      })
    );
  });
});
