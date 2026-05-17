import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./products.service', () => {
  class MockProductsService {
    constructor(_fastify: unknown) {}
  }

  return { ProductsService: MockProductsService };
});

import { registerProductsRoutes } from './products.routes';

describe('products routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers public and admin product routes with schema and guards', async () => {
    const app = Fastify();

    const routes: Array<{ method: string | string[]; url: string; schema?: unknown; preHandler?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema,
        preHandler: routeOptions.preHandler
      });
    });

    await registerProductsRoutes(app);

    const listProducts = routes.find((route) => route.url === '/api/v1/products' && route.method === 'GET');
    expect(listProducts).toBeDefined();
    expect((listProducts?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const adminListProducts = routes.find((route) => route.url === '/api/v1/admin/products' && route.method === 'GET');
    expect(adminListProducts).toBeDefined();
    expect(adminListProducts?.preHandler).toBeDefined();

    const adminCreateProduct = routes.find((route) => route.url === '/api/v1/admin/products' && route.method === 'POST');
    expect(adminCreateProduct).toBeDefined();
    expect((adminCreateProduct?.schema as { body?: unknown }).body).toBeDefined();

    const adminImportCsv = routes.find((route) => route.url === '/api/v1/admin/products/import-csv' && route.method === 'POST');
    expect(adminImportCsv).toBeDefined();
    expect(adminImportCsv?.preHandler).toBeDefined();

    const adminCategories = routes.find((route) => route.url === '/api/v1/admin/categories' && route.method === 'GET');
    expect(adminCategories).toBeDefined();
    expect(adminCategories?.preHandler).toBeDefined();

    await app.close();
  });
});
