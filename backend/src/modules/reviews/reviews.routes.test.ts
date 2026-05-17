import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./reviews.service', () => {
  class MockReviewsService {
    constructor(_fastify: unknown) {}
  }

  return { ReviewsService: MockReviewsService };
});

import { registerReviewsRoutes } from './reviews.routes';

describe('reviews routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers public, customer, and admin review routes with schema and guards', async () => {
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

    await registerReviewsRoutes(app);

    const productReviews = routes.find((route) => route.url === '/api/v1/reviews/product/:slug' && route.method === 'GET');
    expect(productReviews).toBeDefined();
    expect((productReviews?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const myReviews = routes.find((route) => route.url === '/api/v1/reviews/me' && route.method === 'GET');
    expect(myReviews).toBeDefined();
    expect(myReviews?.preHandler).toBeDefined();

    const createReview = routes.find((route) => route.url === '/api/v1/reviews' && route.method === 'POST');
    expect(createReview).toBeDefined();
    expect(createReview?.preHandler).toBeDefined();

    const adminReviews = routes.find((route) => route.url === '/api/v1/admin/reviews' && route.method === 'GET');
    expect(adminReviews).toBeDefined();
    expect(adminReviews?.preHandler).toBeDefined();

    const moderateReview = routes.find((route) => route.url === '/api/v1/admin/reviews/:id/moderate' && route.method === 'PATCH');
    expect(moderateReview).toBeDefined();
    expect(moderateReview?.preHandler).toBeDefined();

    await app.close();
  });
});
