import { OrderStatus, Prisma } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { featureFlags } from '@config/feature-flags';
import { AdminReviewListQuery, CreateReviewInput, ModerateReviewInput, ReviewListQuery } from './reviews.types';

type ReviewWithUser = Prisma.ReviewGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
      };
    };
  };
}>;

export class ReviewsService {
  constructor(private readonly fastify: FastifyInstance) {}

  async createReview(userId: string, input: CreateReviewInput) {
    this.assertReviewsEnabled();

    const product = await this.fastify.prisma.product.findFirst({
      where: { id: input.productId, isActive: true },
      select: { id: true }
    });
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    const deliveredOrder = await this.fastify.prisma.order.findFirst({
      where: {
        id: input.orderId,
        userId,
        status: OrderStatus.DELIVERED,
        items: {
          some: {
            variant: {
              productId: input.productId
            }
          }
        }
      },
      select: { id: true }
    });
    if (!deliveredOrder) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Only delivered order purchasers can review this product', 403);
    }

    const existing = await this.fastify.prisma.review.findUnique({
      where: {
        userId_orderId_productId: {
          userId,
          orderId: input.orderId,
          productId: input.productId
        }
      }
    });
    if (existing) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Review already exists for this order item', 409);
    }

    const review = await this.fastify.prisma.review.create({
      data: {
        userId,
        orderId: input.orderId,
        productId: input.productId,
        rating: input.rating,
        ...(input.body !== undefined ? { body: input.body } : {}),
        images: input.images ?? []
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return this.serializeReview(review, 'owner');
  }

  async listMyReviews(userId: string, query: ReviewListQuery) {
    this.assertReviewsEnabled();
    return this.listReviews({ userId }, query);
  }

  async listProductReviews(slug: string, query: ReviewListQuery) {
    const product = await this.fastify.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: { id: true }
    });
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    if (!featureFlags.reviews) {
      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);
      return {
        items: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      };
    }

    return this.listReviews({ productId: product.id, approved: true }, query, 'public');
  }

  async adminListReviews(query: AdminReviewListQuery) {
    this.assertReviewsEnabled();
    return this.listReviews(
      {
        ...(query.approved !== undefined ? { approved: query.approved } : {})
      },
      query,
      'admin'
    );
  }

  async adminModerateReview(id: string, input: ModerateReviewInput) {
    this.assertReviewsEnabled();
    const existing = await this.fastify.prisma.review.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Review not found', 404);
    }

    const review = await this.fastify.prisma.review.update({
      where: { id },
      data: { approved: input.approved },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    return this.serializeReview(review, 'admin');
  }

  private async listReviews(
    where: Prisma.ReviewWhereInput,
    query: { page?: number; limit?: number },
    visibility: 'owner' | 'public' | 'admin' = 'owner'
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await this.fastify.prisma.$transaction([
      this.fastify.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      this.fastify.prisma.review.count({ where })
    ]);

    return {
      items: items.map((item) => this.serializeReview(item, visibility)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  private serializeReview(review: ReviewWithUser, visibility: 'owner' | 'public' | 'admin' = 'owner') {
    const base = {
      id: review.id,
      rating: review.rating,
      body: review.body,
      images: review.images,
      approved: review.approved,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      author: {
        firstName: review.user.firstName,
        lastName: review.user.lastName
      }
    };
    if (visibility === 'public') {
      return base;
    }
    if (visibility === 'owner') {
      return {
        ...base,
        productId: review.productId
      };
    }
    return {
      ...base,
      userId: review.userId,
      productId: review.productId,
      orderId: review.orderId,
      author: {
        id: review.user.id,
        firstName: review.user.firstName,
        lastName: review.user.lastName
      }
    };
  }

  private assertReviewsEnabled() {
    if (!featureFlags.reviews) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Reviews are disabled', 400);
    }
  }
}
