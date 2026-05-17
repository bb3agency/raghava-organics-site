import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cart.service', () => {
  class MockCartService {
    constructor(_fastify: unknown) {}
  }

  return { CartService: MockCartService };
});

import { registerCartRoutes } from './cart.routes';

describe('cart routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers cart routes with schema and idempotency on mutations', async () => {
    const app = Fastify();
    app.decorate('jwt', {
      verify: vi.fn(() => ({ sub: 'user_1', role: 'CUSTOMER' }))
    } as never);

    const routes: Array<{ method: string | string[]; url: string; schema?: unknown; preHandler?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema,
        preHandler: routeOptions.preHandler
      });
    });

    await registerCartRoutes(app);

    const getCart = routes.find((route) => route.url === '/api/v1/cart' && route.method === 'GET');
    expect(getCart).toBeDefined();
    expect((getCart?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const addItem = routes.find((route) => route.url === '/api/v1/cart/items' && route.method === 'POST');
    expect(addItem).toBeDefined();
    expect(addItem?.preHandler).toBeDefined();

    const applyCoupon = routes.find((route) => route.url === '/api/v1/cart/coupon' && route.method === 'POST');
    expect(applyCoupon).toBeDefined();
    expect(applyCoupon?.preHandler).toBeDefined();

    const merge = routes.find((route) => route.url === '/api/v1/cart/merge' && route.method === 'POST');
    expect(merge).toBeDefined();
    expect((merge?.schema as { body?: unknown }).body).toBeDefined();

    const deliveryRates = routes.find((route) => route.url === '/api/v1/cart/delivery-rates' && route.method === 'GET');
    expect(deliveryRates).toBeDefined();

    await app.close();
  });
});
