import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { featureFlags } from '@config/feature-flags';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const originalReviewsFlag = featureFlags.reviews;

  beforeEach(() => {
    featureFlags.reviews = true;
  });

  afterEach(() => {
    featureFlags.reviews = originalReviewsFlag;
  });

  it('creates review for delivered order purchaser', async () => {
    const service = new ReviewsService({
      prisma: {
        product: {
          findFirst: async () => ({ id: 'product_1' })
        },
        order: {
          findFirst: async () => ({ id: 'order_1' })
        },
        review: {
          findUnique: async () => null,
          create: async () => ({
            id: 'review_1',
            userId: 'user_1',
            productId: 'product_1',
            orderId: 'order_1',
            rating: 5,
            body: 'Great',
            images: [],
            approved: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            user: {
              id: 'user_1',
              firstName: 'Test',
              lastName: 'User'
            }
          })
        }
      }
    } as unknown as FastifyInstance);

    const result = await service.createReview('user_1', {
      productId: 'product_1',
      orderId: 'order_1',
      rating: 5,
      body: 'Great'
    });
    expect(result.id).toBe('review_1');
    expect(result.approved).toBe(false);
  });

  it('admin can moderate (approve) a review', async () => {
    const updatedReview = {
      id: 'review_1',
      userId: 'user_1',
      productId: 'product_1',
      orderId: 'order_1',
      rating: 5,
      body: 'Great',
      images: [],
      approved: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user_1', firstName: 'Test', lastName: 'User' }
    };
    const service = new ReviewsService({
      prisma: {
        review: {
          findUnique: async () => ({ id: 'review_1' }),
          update: async () => updatedReview
        }
      }
    } as unknown as FastifyInstance);

    const result = await service.adminModerateReview('review_1', { approved: true });
    expect(result.approved).toBe(true);
    expect('userId' in result && result.userId).toBe('user_1');
  });

  it('admin moderate throws 404 for unknown review', async () => {
    const service = new ReviewsService({
      prisma: {
        review: {
          findUnique: async () => null
        }
      }
    } as unknown as FastifyInstance);

    await expect(
      service.adminModerateReview('nonexistent', { approved: true })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('admin can delete a review', async () => {
    const service = new ReviewsService({
      prisma: {
        review: {
          findUnique: async () => ({ id: 'review_1' }),
          delete: async () => ({})
        }
      }
    } as unknown as FastifyInstance);

    const result = await service.adminDeleteReview('review_1');
    expect(result).toMatchObject({ id: 'review_1', deleted: true });
  });

  it('admin delete throws 404 for unknown review', async () => {
    const service = new ReviewsService({
      prisma: {
        review: {
          findUnique: async () => null
        }
      }
    } as unknown as FastifyInstance);

    await expect(
      service.adminDeleteReview('nonexistent')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects review when user is not eligible purchaser', async () => {
    const service = new ReviewsService({
      prisma: {
        product: {
          findFirst: async () => ({ id: 'product_1' })
        },
        order: {
          findFirst: async () => null
        }
      }
    } as unknown as FastifyInstance);

    await expect(
      service.createReview('user_1', {
        productId: 'product_1',
        orderId: 'order_1',
        rating: 4
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403
    });
  });
});
