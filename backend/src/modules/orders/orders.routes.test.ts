import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./orders.service', () => {
  class MockOrdersService {
    constructor(_fastify: unknown) {}
  }

  return { OrdersService: MockOrdersService };
});

import { registerOrdersRoutes } from './orders.routes';

describe('orders routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers customer, admin, and webhook routes with schema and guards', async () => {
    const app = Fastify();
    app.decorate(
      'checkoutRisk',
      {
        assertInitiatePaymentAllowed: vi.fn(async () => undefined)
      } as never
    );

    const routes: Array<{ method: string | string[]; url: string; schema?: unknown; preHandler?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema,
        preHandler: routeOptions.preHandler
      });
    });

    await registerOrdersRoutes(app);

    const createOrder = routes.find((route) => route.url === '/api/v1/orders' && route.method === 'POST');
    expect(createOrder).toBeDefined();
    expect(createOrder?.preHandler).toBeDefined();
    expect((createOrder?.schema as { body?: unknown }).body).toBeDefined();

    const paymentWebhook = routes.find((route) => route.url === '/api/v1/payments/webhook' && route.method === 'POST');
    expect(paymentWebhook).toBeDefined();
    expect((paymentWebhook?.schema as { body?: unknown }).body).toBeDefined();

    const adminList = routes.find((route) => route.url === '/api/v1/admin/orders' && route.method === 'GET');
    expect(adminList).toBeDefined();
    expect(adminList?.preHandler).toBeDefined();
    expect((adminList?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const adminStatus = routes.find((route) => route.url === '/api/v1/admin/orders/:id/status' && route.method === 'PATCH');
    expect(adminStatus).toBeDefined();
    expect(adminStatus?.preHandler).toBeDefined();

    const returnRequestsAdmin = routes.find((route) => route.url === '/api/v1/admin/return-requests' && route.method === 'GET');
    expect(returnRequestsAdmin).toBeDefined();
    expect(returnRequestsAdmin?.preHandler).toBeDefined();

    await app.close();
  });
});
