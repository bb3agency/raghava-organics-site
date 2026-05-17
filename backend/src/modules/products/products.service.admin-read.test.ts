import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ProductsService } from './products.service';

describe('ProductsService admin read APIs', () => {
  it('lists admin products with pagination metadata', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const fastify = {
      prisma: {
        $transaction: vi.fn().mockResolvedValue([[], 0]),
        product: {
          findMany,
          count
        }
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
    const result = await service.adminListProducts({ page: 1, limit: 20 });

    expect(result).toEqual({
      items: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20
      })
    );
    expect(count).toHaveBeenCalled();
  });

  it('applies admin product filters for price and stock', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const fastify = {
      prisma: {
        $transaction: vi.fn().mockResolvedValue([[], 0]),
        product: {
          findMany,
          count
        }
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
    await service.adminListProducts({ page: 1, limit: 20, minPrice: 1000, maxPrice: 5000, inStock: true });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          variants: {
            some: expect.objectContaining({
              price: { gte: 1000, lte: 5000 },
              inventory: { is: { quantity: { gt: 0 } } }
            })
          }
        }),
        include: expect.objectContaining({
          variants: expect.objectContaining({
            where: expect.objectContaining({
              price: { gte: 1000, lte: 5000 },
              inventory: { is: { quantity: { gt: 0 } } }
            })
          })
        })
      })
    );
  });

  it('returns admin product by id', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'prod_1',
      name: 'Milk',
      slug: 'milk',
      description: 'Fresh milk',
      tags: [],
      isFeatured: false,
      category: {
        id: 'cat_1',
        name: 'Dairy',
        slug: 'dairy'
      },
      variants: []
    });
    const fastify = {
      prisma: {
        product: {
          findUnique
        }
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
    const product = await service.adminGetProductById('prod_1');

    expect(product.id).toBe('prod_1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod_1' }
      })
    );
  });

  it('lists admin categories without storefront active-only filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const fastify = {
      prisma: {
        $transaction: vi.fn().mockResolvedValue([[], 0]),
        category: {
          findMany,
          count
        }
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
    const result = await service.adminListCategories({ page: 1, limit: 20 });

    expect(result).toEqual({
      items: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        skip: 0,
        take: 20
      })
    );
    expect(count).toHaveBeenCalled();
  });

});
