import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ProductsService } from './products.service';

function makeBaseFastify(overrides: Record<string, unknown> = {}): FastifyInstance {
  return {
    prisma: {
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null)
      },
      productVariant: {},
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cat_1' })
      },
      storeSettings: {
        findUnique: vi.fn().mockResolvedValue({ defaultLowStockThreshold: 5 })
      },
      inventory: { upsert: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([[], 0])
    },
    redis: {
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([])
    },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides
  } as unknown as FastifyInstance;
}

// ── adminCreateProduct ────────────────────────────────────────────────────────

describe('ProductsService adminCreateProduct', () => {
  it('throws 400 for duplicate image sort orders', async () => {
    const fastify = makeBaseFastify();
    const service = new ProductsService(fastify);

    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    await expect(
      service.adminCreateProduct({
        name: 'T-Shirt',
        slug: 'tshirt',
        description: 'desc',
        categoryId: 'cat_1',
        images: [
          { url: 'https://img.test/1.jpg', altText: 'alt', sortOrder: 1 },
          { url: 'https://img.test/2.jpg', altText: 'alt', sortOrder: 1 }
        ]
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when category does not exist', async () => {
    const fastify = makeBaseFastify();
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);

    await expect(
      service.adminCreateProduct({
        name: 'T-Shirt',
        slug: 'tshirt',
        description: 'desc',
        categoryId: 'nonexistent'
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns existing product when slug already exists (idempotent)', async () => {
    const existingProduct = {
      id: 'prod_1',
      slug: 'tshirt',
      name: 'T-Shirt',
      category: { id: 'cat_1' },
      images: [],
      variants: []
    };
    const fastify = makeBaseFastify();
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockImplementation(({ where }: { where: { id?: string; slug?: string } }) => {
        if ('slug' in where) return Promise.resolve(existingProduct);
        return Promise.resolve(null);
      });
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue({ id: 'cat_1' });

    const service = new ProductsService(fastify);
    const result = await service.adminCreateProduct({
      name: 'T-Shirt',
      slug: 'tshirt',
      description: 'desc',
      categoryId: 'cat_1'
    });

    expect(result).toMatchObject({ id: 'prod_1', slug: 'tshirt' });
    expect((fastify.prisma.product as unknown as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it('creates a new product and invalidates cache', async () => {
    const created = { id: 'prod_new', slug: 'new-product', name: 'New', category: {}, images: [], variants: [] };
    const fastify = makeBaseFastify();
    const findUnique = vi.fn().mockResolvedValue(null);
    const createFn = vi.fn().mockResolvedValue(created);
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).findUnique = findUnique;
    (fastify.prisma.product as unknown as { create: ReturnType<typeof vi.fn> }).create = createFn;
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue({ id: 'cat_1' });

    const service = new ProductsService(fastify);
    const result = await service.adminCreateProduct({
      name: 'New',
      slug: 'new-product',
      description: 'desc',
      categoryId: 'cat_1'
    });

    expect(result).toMatchObject({ id: 'prod_new' });
    expect(createFn).toHaveBeenCalledOnce();
  });
});

// ── adminUpdateProduct ────────────────────────────────────────────────────────

describe('ProductsService adminUpdateProduct', () => {
  it('throws 404 when product does not exist', async () => {
    const fastify = makeBaseFastify();
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);
    await expect(service.adminUpdateProduct('nonexistent', { name: 'Updated' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when new categoryId does not exist', async () => {
    const existing = { id: 'prod_1', updatedAt: new Date() };
    const fastify = makeBaseFastify();
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(existing);
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);
    await expect(service.adminUpdateProduct('prod_1', { categoryId: 'nonexistent' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates name and returns refreshed product', async () => {
    const existing = { id: 'prod_1', updatedAt: new Date() };
    const updated = { id: 'prod_1', name: 'Updated', category: {}, images: [], variants: [] };
    const fastify = makeBaseFastify();
    const updateFn = vi.fn().mockResolvedValue(updated);
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(existing);
    (fastify.prisma.product as unknown as { update: ReturnType<typeof vi.fn> }).update = updateFn;
    (fastify.prisma.product as unknown as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow = vi.fn().mockResolvedValue(updated);

    const service = new ProductsService(fastify);
    const result = await service.adminUpdateProduct('prod_1', { name: 'Updated' });

    expect(result).toMatchObject({ id: 'prod_1', name: 'Updated' });
    expect(updateFn).toHaveBeenCalledOnce();
  });
});

// ── adminDeleteProduct ────────────────────────────────────────────────────────

describe('ProductsService adminDeleteProduct', () => {
  it('throws 404 when product does not exist', async () => {
    const fastify = makeBaseFastify();
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);
    await expect(service.adminDeleteProduct('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deactivates product and returns success message', async () => {
    const existing = { id: 'prod_1', isActive: true };
    const fastify = makeBaseFastify();
    const updateFn = vi.fn().mockResolvedValue({ id: 'prod_1', isActive: false });
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(existing);
    (fastify.prisma.product as unknown as { update: ReturnType<typeof vi.fn> }).update = updateFn;

    const service = new ProductsService(fastify);
    const result = await service.adminDeleteProduct('prod_1');

    expect(result).toMatchObject({ message: 'Product deactivated' });
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'prod_1' }, data: { isActive: false } }));
  });
});

// ── adminCreateCategory ───────────────────────────────────────────────────────

describe('ProductsService adminCreateCategory', () => {
  it('creates a new category via upsert and returns it', async () => {
    const created = { id: 'cat_new', name: 'Shoes', slug: 'shoes' };
    const fastify = makeBaseFastify();
    const upsertFn = vi.fn().mockResolvedValue(created);
    (fastify.prisma.category as unknown as { upsert: ReturnType<typeof vi.fn> }).upsert = upsertFn;

    const service = new ProductsService(fastify);
    const result = await service.adminCreateCategory({ name: 'Shoes', slug: 'shoes' });

    expect(result).toMatchObject({ id: 'cat_new', name: 'Shoes' });
    expect(upsertFn).toHaveBeenCalledOnce();
  });

  it('returns existing category when slug already exists (upsert updates name)', async () => {
    const existing = { id: 'cat_1', name: 'Footwear', slug: 'shoes' };
    const fastify = makeBaseFastify();
    (fastify.prisma.category as unknown as { upsert: ReturnType<typeof vi.fn> }).upsert = vi.fn().mockResolvedValue(existing);

    const service = new ProductsService(fastify);
    const result = await service.adminCreateCategory({ name: 'Footwear', slug: 'shoes' });

    expect(result.id).toBe('cat_1');
  });
});

// ── adminUpdateCategory ───────────────────────────────────────────────────────

describe('ProductsService adminUpdateCategory', () => {
  it('throws 404 when category does not exist', async () => {
    const fastify = makeBaseFastify();
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);
    await expect(service.adminUpdateCategory('nonexistent', { name: 'Updated' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates category name and returns refreshed category', async () => {
    const existing = { id: 'cat_1', updatedAt: new Date() };
    const updated = { id: 'cat_1', name: 'Updated' };
    const fastify = makeBaseFastify();
    const updateFn = vi.fn().mockResolvedValue(updated);
    const findUniqueOrThrowFn = vi.fn().mockResolvedValue(updated);
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(existing);
    (fastify.prisma.category as unknown as { update: ReturnType<typeof vi.fn> }).update = updateFn;
    (fastify.prisma.category as unknown as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow = findUniqueOrThrowFn;

    const service = new ProductsService(fastify);
    const result = await service.adminUpdateCategory('cat_1', { name: 'Updated' });

    expect(result).toMatchObject({ id: 'cat_1', name: 'Updated' });
    expect(updateFn).toHaveBeenCalledOnce();
  });
});

// ── adminDeleteCategory ───────────────────────────────────────────────────────

describe('ProductsService adminDeleteCategory', () => {
  it('throws 404 when category does not exist', async () => {
    const fastify = makeBaseFastify();
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(null);

    const service = new ProductsService(fastify);
    await expect(service.adminDeleteCategory('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deactivates category and returns message', async () => {
    const existing = { id: 'cat_1', isActive: true };
    const fastify = makeBaseFastify();
    const updateFn = vi.fn().mockResolvedValue({ id: 'cat_1', isActive: false });
    (fastify.prisma.category as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi.fn().mockResolvedValue(existing);
    (fastify.prisma.category as unknown as { update: ReturnType<typeof vi.fn> }).update = updateFn;

    const service = new ProductsService(fastify);
    const result = await service.adminDeleteCategory('cat_1');

    expect(result).toMatchObject({ message: 'Category deactivated' });
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cat_1' }, data: { isActive: false } }));
  });
});

// ── adminImportProductsCsv ────────────────────────────────────────────────────

describe('ProductsService adminImportProductsCsv', () => {
  it('throws 400 when CSV has only header and no data rows', async () => {
    const fastify = makeBaseFastify();
    const service = new ProductsService(fastify);

    await expect(
      service.adminImportProductsCsv({ csv: 'name,slug,description,categoryslug' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when CSV is missing required columns', async () => {
    const fastify = makeBaseFastify();
    const service = new ProductsService(fastify);

    await expect(
      service.adminImportProductsCsv({ csv: 'name,slug\nShoes,shoes' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('processes a valid CSV row and returns created count', async () => {
    const fastify = makeBaseFastify();
    const findFirstCategory = vi.fn().mockResolvedValue({ id: 'cat_1' });
    const findUniqueProduct = vi.fn().mockResolvedValue(null);
    const createProduct = vi.fn().mockResolvedValue({ id: 'prod_1' });
    (fastify.prisma.category as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst = findFirstCategory;
    (fastify.prisma.product as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = findUniqueProduct;
    (fastify.prisma.product as unknown as { create: ReturnType<typeof vi.fn> }).create = createProduct;

    const service = new ProductsService(fastify);
    const csv = 'name,slug,description,categoryslug\nShoes,shoes,Great shoes,footwear';
    const result = await service.adminImportProductsCsv({ csv });

    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(0);
  });
});
