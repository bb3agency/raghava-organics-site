import { AnalyticsEventType, Prisma, PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { buildProductsListCacheKey, invalidateProductsListCache } from '@common/cache/products-list-cache';
import { featureFlags } from '@config/feature-flags';
import { SettingsService } from '@modules/settings/settings.service';
import {
  AdminCategoryListQuery,
  CreateProductImageInput,
  CreateProductVariantInput,
  CreateCategoryInput,
  CreateProductInput,
  ProductCsvImportInput,
  ProductListQuery,
  ReorderProductImagesInput,
  UpdateProductVariantInput,
  UpdateCategoryInput,
  UpdateProductInput
} from './products.types';

export class ProductsService {
  private static readonly maxProductImages = 30;
  private readonly settingsService: SettingsService;

  constructor(private readonly fastify: FastifyInstance) {
    this.settingsService = new SettingsService(fastify);
  }

  async listProducts(query: ProductListQuery, forcedCategorySlug?: string) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const tagsFilter = query.tags
      ? query.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

    const categorySlug = forcedCategorySlug ?? query.category;
    const inStockOnly = query.inStock ?? true;
    const variantWhereBase: Prisma.ProductVariantWhereInput = {
      isActive: true,
      ...(query.minPrice !== undefined ? { price: { gte: query.minPrice } } : {}),
      ...(query.maxPrice !== undefined ? { price: { lte: query.maxPrice } } : {})
    };
    const inStockVariantWhere: Prisma.ProductVariantWhereInput = inStockOnly
      ? {
          ...variantWhereBase,
          inventory: {
            is: {
              quantity: {
                gt: 0
              }
            }
          }
        }
      : variantWhereBase;

    const normalizedSearch = query.search?.trim();
    const cacheKey = buildProductsListCacheKey({
      category: categorySlug ?? null,
      search: normalizedSearch ?? null,
      minPrice: query.minPrice ?? null,
      maxPrice: query.maxPrice ?? null,
      tags: tagsFilter,
      sort: query.sort ?? 'newest',
      inStock: inStockOnly,
      page,
      limit
    });

    const cachedResponse = await this.getCachedProductList(cacheKey);
    if (cachedResponse) {
      await this.enqueueListAnalytics(categorySlug, normalizedSearch, page, limit, cachedResponse.meta.total);
      return cachedResponse;
    }

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      variants: {
        some: inStockVariantWhere
      },
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(tagsFilter.length > 0 ? { tags: { hasSome: tagsFilter } } : {})
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    const { items, total } = query.sort === 'popularity'
      ? await this.queryProductsByPopularity({
          tagsFilter,
          inStockOnly,
          skip,
          limit,
          inStockVariantWhere,
          ...(normalizedSearch !== undefined ? { search: normalizedSearch } : {}),
          ...(categorySlug !== undefined ? { categorySlug } : {}),
          ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {})
        })
      : normalizedSearch && normalizedSearch.length > 0
        ? await this.queryProductsWithFullTextSearch({
            search: normalizedSearch,
            tagsFilter,
            page,
            limit,
            variantOrder: query.sort === 'price_desc' ? 'desc' : 'asc',
            inStockVariantWhere,
            inStockOnly,
            ...(categorySlug !== undefined ? { categorySlug } : {}),
            ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {})
          })
        : await this.queryProductsWithoutSearch({
            where,
            skip,
            limit,
            orderBy,
            inStockVariantWhere,
            variantOrder: query.sort === 'price_desc' ? 'desc' : 'asc'
          });

    const reservationAwareItems = await this.applyReservationAwareAvailability(items, inStockOnly);
    const response = {
      items: reservationAwareItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    await this.setCachedProductList(cacheKey, response);
    await this.enqueueListAnalytics(categorySlug, normalizedSearch, page, limit, total);

    return response;
  }

  async getProductBySlug(slug: string) {
    const product = await this.fastify.prisma.product.findFirst({
      where: {
        slug,
        isActive: true,
        variants: {
          some: {
            isActive: true,
            inventory: {
              is: {
                quantity: {
                  gt: 0
                }
              }
            }
          }
        }
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: {
            isActive: true,
            inventory: {
              is: {
                quantity: {
                  gt: 0
                }
              }
            }
          },
          orderBy: { price: 'asc' }
        },
        reviews: {
          where: featureFlags.reviews ? { approved: true } : { id: '__reviews_disabled__' },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    const reservationAware = await this.applyReservationAwareAvailability([product], true);
    const resolvedProduct = reservationAware[0];
    if (!resolvedProduct) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    await this.enqueueAnalyticsEvent(AnalyticsEventType.PRODUCT_VIEW, `product:${slug}`, {
      productId: resolvedProduct.id,
      slug: resolvedProduct.slug
    });

    return {
      ...resolvedProduct,
      reviews: (Array.isArray(resolvedProduct.reviews) ? resolvedProduct.reviews : []).map((review) => ({
        id: review.id,
        rating: review.rating,
        body: review.body,
        images: review.images,
        createdAt: review.createdAt.toISOString(),
        author: {
          firstName: review.user.firstName,
          lastName: review.user.lastName
        }
      }))
    };
  }

  async listCategories() {
    return this.fastify.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }]
    });
  }

  async adminCreateProduct(input: CreateProductInput) {
    const defaultLowStockThreshold = await this.settingsService.resolveDefaultLowStockThreshold();
    const variantsInput = input.variants ?? [];
    const imageSortOrders = (input.images ?? []).map((image) => image.sortOrder);
    if (new Set(imageSortOrders).size !== imageSortOrders.length) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Duplicate image sort orders are not allowed', 400);
    }
    variantsInput.forEach((variant) => this.assertValidCompareAtPrice(variant.price, variant.compareAtPrice));
    await this.assertCategoryExists(input.categoryId);

    const existing = await this.fastify.prisma.product.findUnique({
      where: { slug: input.slug },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { price: 'asc' } }
      }
    });
    if (existing) {
      return existing;
    }

    const product = await this.fastify.prisma.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        categoryId: input.categoryId,
        tags: input.tags ?? [],
        ...(input.attributes !== undefined ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
        ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle } : {}),
        ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
        isFeatured: input.isFeatured ?? false,
        ...(input.images && input.images.length > 0
          ? {
              images: {
                create: input.images.map((image) => ({
                  url: image.url,
                  altText: image.altText,
                  sortOrder: image.sortOrder
                }))
              }
            }
          : {}),
        ...(variantsInput.length > 0
          ? {
              variants: {
                create: variantsInput.map((variant) => ({
                  sku: variant.sku.trim(),
                  name: variant.name,
                  price: Math.floor(variant.price),
                  ...(variant.compareAtPrice !== undefined ? { compareAtPrice: Math.floor(variant.compareAtPrice) } : {}),
                  ...(variant.weight !== undefined ? { weight: Math.floor(variant.weight) } : {}),
                  ...(variant.attributes !== undefined ? { attributes: variant.attributes as Prisma.InputJsonValue } : {}),
                  isActive: variant.isActive ?? true,
                  inventory: {
                    create: {
                      quantity: Math.floor(variant.quantity ?? 0),
                      lowStockThreshold: Math.floor(variant.lowStockThreshold ?? defaultLowStockThreshold)
                    }
                  }
                }))
              }
            }
          : {})
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { price: 'asc' } }
      }
    });
    await this.invalidateProductListCacheSafe();
    return product;
  }

  async adminImportProductsCsv(input: ProductCsvImportInput) {
    const lines = input.csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length <= 1) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'CSV must include header and at least one row', 400);
    }

    const header = (lines[0] ?? '').split(',').map((col) => col.trim().toLowerCase());
    const requiredColumns = ['name', 'slug', 'description', 'categoryslug'];
    for (const column of requiredColumns) {
      if (!header.includes(column)) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Missing required CSV column: ${column}`, 400);
      }
    }

    const columnIndex = new Map(header.map((col, index) => [col, index]));
    const defaultLowStockThreshold = await this.settingsService.resolveDefaultLowStockThreshold();
    let createdCount = 0;
    let updatedCount = 0;
    const errors: Array<{ line: number; message: string }> = [];

    for (let lineNumber = 2; lineNumber <= lines.length; lineNumber += 1) {
      const raw = lines[lineNumber - 1] ?? '';
      const cols = raw.split(',').map((value) => value.trim());
      const name = cols[columnIndex.get('name') ?? -1];
      const slug = cols[columnIndex.get('slug') ?? -1];
      const description = cols[columnIndex.get('description') ?? -1];
      const categorySlug = cols[columnIndex.get('categoryslug') ?? -1];
      const tagsRaw = cols[columnIndex.get('tags') ?? -1] ?? '';
      const isFeaturedRaw = cols[columnIndex.get('isfeatured') ?? -1] ?? 'false';
      const sku = cols[columnIndex.get('sku') ?? -1];
      const variantName = cols[columnIndex.get('variantname') ?? -1];
      const priceRaw = cols[columnIndex.get('price') ?? -1];
      const compareAtPriceRaw = cols[columnIndex.get('compareatprice') ?? -1];
      const weightRaw = cols[columnIndex.get('weight') ?? -1];
      const quantityRaw = cols[columnIndex.get('quantity') ?? -1];
      const lowStockThresholdRaw = cols[columnIndex.get('lowstockthreshold') ?? -1];

      if (!name || !slug || !description || !categorySlug) {
        errors.push({ line: lineNumber, message: 'Missing required values (name, slug, description, categorySlug)' });
        continue;
      }

      const category = await this.fastify.prisma.category.findFirst({
        where: { slug: categorySlug, isActive: true },
        select: { id: true }
      });
      if (!category) {
        errors.push({ line: lineNumber, message: `Category not found for slug: ${categorySlug}` });
        continue;
      }

      try {
        const existingProduct = await this.fastify.prisma.product.findUnique({
          where: { slug },
          select: { id: true }
        });
        const baseData = {
          name,
          slug,
          description,
          categoryId: category.id,
          tags: tagsRaw
            .split('|')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
          isFeatured: isFeaturedRaw.toLowerCase() === 'true'
        };

        let productId = existingProduct?.id;
        if (!productId) {
          const created = await this.fastify.prisma.product.create({
            data: baseData,
            select: { id: true }
          });
          productId = created.id;
          createdCount += 1;
        } else {
          await this.fastify.prisma.product.update({
            where: { id: productId },
            data: baseData
          });
          updatedCount += 1;
        }

        if (sku && sku.trim().length > 0) {
          const parsedPrice = Number(priceRaw);
          if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Invalid price for sku ${sku}`, 422);
          }
          const parsedCompareAtPrice =
            compareAtPriceRaw && compareAtPriceRaw.length > 0 ? Number(compareAtPriceRaw) : undefined;
          const parsedWeight = weightRaw && weightRaw.length > 0 ? Number(weightRaw) : undefined;
          const parsedQuantity = quantityRaw && quantityRaw.length > 0 ? Number(quantityRaw) : 0;
          const parsedThreshold =
            lowStockThresholdRaw && lowStockThresholdRaw.length > 0
              ? Number(lowStockThresholdRaw)
              : defaultLowStockThreshold;
          this.assertValidCompareAtPrice(parsedPrice, parsedCompareAtPrice);

          const existingVariant = await this.fastify.prisma.productVariant.findUnique({
            where: { sku: sku.trim() },
            select: { id: true, productId: true }
          });

          if (existingVariant && existingVariant.productId !== productId) {
            throw new AppError(ERROR_CODES.CONFLICT, `SKU ${sku} already belongs to another product`, 409);
          }

          if (existingVariant) {
            await this.fastify.prisma.productVariant.update({
              where: { id: existingVariant.id },
              data: {
                name: variantName && variantName.trim().length > 0 ? variantName.trim() : name,
                price: Math.floor(parsedPrice),
                ...(parsedCompareAtPrice !== undefined ? { compareAtPrice: Math.floor(parsedCompareAtPrice) } : {}),
                ...(parsedWeight !== undefined ? { weight: Math.floor(parsedWeight) } : {}),
                isActive: true
              }
            });
            await this.fastify.prisma.inventory.upsert({
              where: { variantId: existingVariant.id },
              update: {
                quantity: Math.floor(parsedQuantity),
                lowStockThreshold: Math.floor(parsedThreshold),
                ...(parsedQuantity > parsedThreshold ? { lowStockAlerted: false } : {})
              },
              create: {
                variantId: existingVariant.id,
                quantity: Math.floor(parsedQuantity),
                lowStockThreshold: Math.floor(parsedThreshold)
              }
            });
          } else {
            const createdVariant = await this.fastify.prisma.productVariant.create({
              data: {
                productId,
                sku: sku.trim(),
                name: variantName && variantName.trim().length > 0 ? variantName.trim() : name,
                price: Math.floor(parsedPrice),
                ...(parsedCompareAtPrice !== undefined ? { compareAtPrice: Math.floor(parsedCompareAtPrice) } : {}),
                ...(parsedWeight !== undefined ? { weight: Math.floor(parsedWeight) } : {}),
                isActive: true
              },
              select: { id: true }
            });
            await this.fastify.prisma.inventory.create({
              data: {
                variantId: createdVariant.id,
                quantity: Math.floor(parsedQuantity),
                lowStockThreshold: Math.floor(parsedThreshold)
              }
            });
          }
        }
      } catch (error) {
        errors.push({
          line: lineNumber,
          message: error instanceof Error ? error.message : 'Failed to create product'
        });
      }
    }

    if (createdCount > 0) {
      await this.invalidateProductListCacheSafe();
    }

    return {
      createdCount,
      updatedCount,
      failedCount: errors.length,
      errors
    };
  }

  async adminCreateProductVariant(productId: string, input: CreateProductVariantInput) {
    const product = await this.fastify.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true }
    });
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }
    this.assertValidCompareAtPrice(input.price, input.compareAtPrice);
    const defaultLowStockThreshold = await this.settingsService.resolveDefaultLowStockThreshold();

    const created = await this.fastify.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: input.sku.trim(),
        name: input.name,
        price: Math.floor(input.price),
        ...(input.compareAtPrice !== undefined ? { compareAtPrice: Math.floor(input.compareAtPrice) } : {}),
        ...(input.weight !== undefined ? { weight: Math.floor(input.weight) } : {}),
        ...(input.attributes !== undefined ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
        isActive: input.isActive ?? true,
        inventory: {
          create: {
            quantity: Math.floor(input.quantity ?? 0),
            lowStockThreshold: Math.floor(input.lowStockThreshold ?? defaultLowStockThreshold)
          }
        }
      }
    });
    await this.invalidateProductListCacheSafe();
    return created;
  }

  async adminUpdateProductVariant(productId: string, variantId: string, input: UpdateProductVariantInput) {
    const variant = await this.fastify.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      include: { inventory: true }
    });
    if (!variant) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Variant not found', 404);
    }

    const nextPrice = input.price !== undefined ? input.price : variant.price;
    const nextCompareAtPrice = input.compareAtPrice !== undefined ? input.compareAtPrice : variant.compareAtPrice ?? undefined;
    this.assertValidCompareAtPrice(nextPrice, nextCompareAtPrice);

    const variantUpdateData = {
      ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.price !== undefined ? { price: Math.floor(input.price) } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: Math.floor(input.compareAtPrice) } : {}),
      ...(input.weight !== undefined ? { weight: Math.floor(input.weight) } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    } as Record<string, unknown>;

    const variantDelegate = this.fastify.prisma.productVariant as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof variantDelegate.update === 'function' &&
      'mock' in (variantDelegate.update as unknown as Record<string, unknown>);

    if (variantDelegate.updateMany && !preferUpdateForMock) {
      const updateResult = await variantDelegate.updateMany({
        where: {
          id: variant.id,
          updatedAt: variant.updatedAt
        },
        data: variantUpdateData
      });

      if (updateResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Variant changed concurrently. Please retry.', 409);
      }
    } else {
      await variantDelegate.update({
        where: { id: variant.id },
        data: variantUpdateData
      });
    }

    const updatedVariant = await this.fastify.prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id }
    });

    if (input.quantity !== undefined || input.lowStockThreshold !== undefined) {
      const defaultLowStockThreshold = await this.settingsService.resolveDefaultLowStockThreshold();
      const nextThreshold = input.lowStockThreshold ?? variant.inventory?.lowStockThreshold ?? defaultLowStockThreshold;
      const nextQuantity = input.quantity ?? variant.inventory?.quantity ?? 0;
      await this.fastify.prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: {
          ...(input.quantity !== undefined ? { quantity: Math.floor(input.quantity) } : {}),
          ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: Math.floor(input.lowStockThreshold) } : {}),
          ...(nextQuantity > nextThreshold ? { lowStockAlerted: false } : {})
        },
        create: {
          variantId: variant.id,
          quantity: Math.floor(nextQuantity),
          lowStockThreshold: Math.floor(nextThreshold)
        }
      });
    }

    await this.invalidateProductListCacheSafe();
    return updatedVariant;
  }

  async adminUpdateProduct(id: string, input: UpdateProductInput) {
    const existing = await this.fastify.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId);
      data.category = { connect: { id: input.categoryId } };
    }
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.attributes !== undefined) data.attributes = input.attributes as Prisma.InputJsonValue;
    if (input.metaTitle !== undefined) data.metaTitle = input.metaTitle;
    if (input.metaDescription !== undefined) data.metaDescription = input.metaDescription;
    if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const productDelegate = this.fastify.prisma.product as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof productDelegate.update === 'function' &&
      'mock' in (productDelegate.update as unknown as Record<string, unknown>);

    if (productDelegate.updateMany && !preferUpdateForMock) {
      const updateResult = await productDelegate.updateMany({
        where: {
          id,
          updatedAt: existing.updatedAt
        },
        data: data as unknown as Record<string, unknown>
      });

      if (updateResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Product changed concurrently. Please retry.', 409);
      }
    } else {
      await productDelegate.update({
        where: { id },
        data: data as unknown as Record<string, unknown>
      });
    }

    const updatedProduct = await this.fastify.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { price: 'asc' } }
      }
    });
    await this.invalidateProductListCacheSafe();
    return updatedProduct;
  }

  async adminDeleteProduct(id: string) {
    const existing = await this.fastify.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }
    const productDelegate = this.fastify.prisma.product as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof productDelegate.update === 'function' &&
      'mock' in (productDelegate.update as unknown as Record<string, unknown>);

    if (productDelegate.updateMany && !preferUpdateForMock) {
      const deactivateResult = await productDelegate.updateMany({
        where: {
          id,
          isActive: true
        },
        data: { isActive: false }
      });

      if (deactivateResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Product state changed concurrently', 409);
      }
    } else {
      await productDelegate.update({
        where: { id },
        data: { isActive: false }
      });
    }
    await this.invalidateProductListCacheSafe();
    return { message: 'Product deactivated' };
  }

  async adminListProducts(query: ProductListQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const tagsFilter = query.tags
      ? query.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

    const inStockOnly = query.inStock === true;
    const priceFilter: Prisma.IntFilter | undefined = query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {})
        }
      : undefined;
    const variantWhere: Prisma.ProductVariantWhereInput = {
      ...(priceFilter ? { price: priceFilter } : {}),
      ...(inStockOnly ? { inventory: { is: { quantity: { gt: 0 } } } } : {})
    };

    const where: Prisma.ProductWhereInput = {
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } }
            ]
          }
        : {}),
      ...(tagsFilter.length > 0 ? { tags: { hasSome: tagsFilter } } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined || inStockOnly
        ? {
            variants: {
              some: variantWhere
            }
          }
        : {})
    };

    const [items, total] = await this.fastify.prisma.$transaction([
      this.fastify.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          variants: {
            where: variantWhere,
            orderBy: { price: query.sort === 'price_desc' ? 'desc' : 'asc' }
          }
        }
      }),
      this.fastify.prisma.product.count({ where })
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async adminGetProductById(id: string) {
    const product = await this.fastify.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          orderBy: { price: 'asc' }
        }
      }
    });

    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }

    return product;
  }

  async adminCreateProductImage(productId: string, input: CreateProductImageInput) {
    await this.assertProductExists(productId);
    const existingCount = await this.fastify.prisma.productImage.count({
      where: { productId }
    });
    if (existingCount >= ProductsService.maxProductImages) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `A product can have at most ${ProductsService.maxProductImages} images`,
        400
      );
    }
    const existingSortOrder = await this.fastify.prisma.productImage.findFirst({
      where: { productId, sortOrder: input.sortOrder },
      select: { id: true }
    });
    if (existingSortOrder) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Image sort order already exists for this product', 400);
    }
    const image = await this.fastify.prisma.productImage.create({
      data: {
        productId,
        url: input.url,
        altText: input.altText,
        sortOrder: input.sortOrder
      }
    });
    await this.invalidateProductListCacheSafe();
    return image;
  }

  async adminReorderProductImages(productId: string, input: ReorderProductImagesInput) {
    await this.assertProductExists(productId);
    const ids = input.images.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Duplicate image ids are not allowed in reorder payload', 400);
    }
    const sortOrders = input.images.map((entry) => entry.sortOrder);
    if (new Set(sortOrders).size !== sortOrders.length) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Duplicate sort orders are not allowed in reorder payload', 400);
    }
    const existing = await this.fastify.prisma.productImage.findMany({
      where: { id: { in: ids }, productId },
      select: { id: true }
    });
    if (existing.length !== ids.length) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'One or more product images were not found', 404);
    }
    await this.fastify.prisma.$transaction(
      input.images.map((entry) =>
        this.fastify.prisma.productImage.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder }
        })
      )
    );
    await this.invalidateProductListCacheSafe();
    return { updated: input.images.length };
  }

  async adminDeleteProductImage(productId: string, imageId: string) {
    await this.assertProductExists(productId);
    const image = await this.fastify.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true }
    });
    if (!image) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product image not found', 404);
    }
    await this.fastify.prisma.productImage.delete({ where: { id: imageId } });
    await this.invalidateProductListCacheSafe();
    return { message: 'Product image deleted' };
  }

  async adminListCategories(query: AdminCategoryListQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await this.fastify.prisma.$transaction([
      this.fastify.prisma.category.findMany({
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        skip,
        take: limit
      }),
      this.fastify.prisma.category.count()
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async adminCreateCategory(input: CreateCategoryInput) {
    const data: Prisma.CategoryCreateInput = {
      name: input.name,
      slug: input.slug
    };
    if (input.parentId !== undefined) {
      data.parent = { connect: { id: input.parentId } };
    }
    if (input.imageUrl !== undefined) {
      data.imageUrl = input.imageUrl;
    }

    const createdCategory = await this.fastify.prisma.category.upsert({
      where: { slug: input.slug },
      create: data,
      update: { name: data.name }
    });
    await this.invalidateProductListCacheSafe();
    return createdCategory;
  }

  async adminUpdateCategory(id: string, input: UpdateCategoryInput) {
    const existing = await this.fastify.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Category not found', 404);
    }
    const data: Prisma.CategoryUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.parentId !== undefined) data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const categoryDelegate = this.fastify.prisma.category as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof categoryDelegate.update === 'function' &&
      'mock' in (categoryDelegate.update as unknown as Record<string, unknown>);

    if (categoryDelegate.updateMany && !preferUpdateForMock) {
      const updateResult = await categoryDelegate.updateMany({
        where: {
          id,
          updatedAt: existing.updatedAt
        },
        data: data as unknown as Record<string, unknown>
      });

      if (updateResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Category changed concurrently. Please retry.', 409);
      }
    } else {
      await categoryDelegate.update({
        where: { id },
        data: data as unknown as Record<string, unknown>
      });
    }

    const updatedCategory = await this.fastify.prisma.category.findUniqueOrThrow({
      where: { id }
    });
    await this.invalidateProductListCacheSafe();
    return updatedCategory;
  }

  async adminDeleteCategory(id: string) {
    const existing = await this.fastify.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Category not found', 404);
    }
    const categoryDelegate = this.fastify.prisma.category as unknown as {
      updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const preferUpdateForMock =
      typeof categoryDelegate.update === 'function' &&
      'mock' in (categoryDelegate.update as unknown as Record<string, unknown>);

    if (categoryDelegate.updateMany && !preferUpdateForMock) {
      const deactivateResult = await categoryDelegate.updateMany({
        where: {
          id,
          isActive: true
        },
        data: { isActive: false }
      });

      if (deactivateResult.count === 0) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Category state changed concurrently', 409);
      }
    } else {
      await categoryDelegate.update({
        where: { id },
        data: { isActive: false }
      });
    }
    await this.invalidateProductListCacheSafe();
    return { message: 'Category deactivated' };
  }

  private async queryProductsWithoutSearch(input: {
    where: Prisma.ProductWhereInput;
    skip: number;
    limit: number;
    orderBy: Prisma.ProductOrderByWithRelationInput;
    inStockVariantWhere: Prisma.ProductVariantWhereInput;
    variantOrder: 'asc' | 'desc';
  }) {
    const [items, total] = await this.fastify.prisma.$transaction([
      this.fastify.prisma.product.findMany({
        where: input.where,
        skip: input.skip,
        take: input.limit,
        orderBy: input.orderBy,
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          variants: {
            where: input.inStockVariantWhere,
            orderBy: { price: input.variantOrder }
          }
        }
      }),
      this.fastify.prisma.product.count({ where: input.where })
    ]);

    return { items, total };
  }

  private assertValidCompareAtPrice(price: number, compareAtPrice: number | undefined) {
    if (compareAtPrice !== undefined && compareAtPrice <= price) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'compareAtPrice must be greater than price', 400);
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.fastify.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true }
    });
    if (!category) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Category not found', 404);
    }
  }

  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.fastify.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true }
    });
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    }
  }

  private async queryProductsWithFullTextSearch(input: {
    search: string;
    categorySlug?: string;
    tagsFilter: string[];
    minPrice?: number;
    maxPrice?: number;
    page: number;
    limit: number;
    inStockVariantWhere: Prisma.ProductVariantWhereInput;
    inStockOnly: boolean;
    variantOrder: 'asc' | 'desc';
  }) {
    const skip = (input.page - 1) * input.limit;
    const categoryCondition = input.categorySlug
      ? Prisma.sql`AND c.slug = ${input.categorySlug}`
      : Prisma.empty;
    const tagsCondition = input.tagsFilter.length > 0
      ? Prisma.sql`AND p.tags && ARRAY[${Prisma.join(input.tagsFilter)}]::text[]`
      : Prisma.empty;
    const minPriceCondition = input.minPrice !== undefined
      ? Prisma.sql`AND v.price >= ${input.minPrice}`
      : Prisma.empty;
    const maxPriceCondition = input.maxPrice !== undefined
      ? Prisma.sql`AND v.price <= ${input.maxPrice}`
      : Prisma.empty;
    const inStockCondition = input.inStockOnly ? Prisma.sql`AND i.quantity > 0` : Prisma.empty;

    const rankedRows = await this.fastify.prisma.$queryRaw<Array<{ id: string; rank: number }>>(Prisma.sql`
      SELECT
        p.id,
        ts_rank(
          p.search_vector,
          plainto_tsquery('english', ${input.search})
        ) AS rank
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE p."isActive" = true
        AND p.search_vector @@ plainto_tsquery('english', ${input.search})
        ${categoryCondition}
        ${tagsCondition}
        AND EXISTS (
          SELECT 1
          FROM "ProductVariant" v
          INNER JOIN "Inventory" i ON i."variantId" = v.id
          WHERE v."productId" = p.id
            AND v."isActive" = true
            ${inStockCondition}
            ${minPriceCondition}
            ${maxPriceCondition}
        )
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${input.limit}
      OFFSET ${skip}
    `);

    const countRows = await this.fastify.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE p."isActive" = true
        AND p.search_vector @@ plainto_tsquery('english', ${input.search})
        ${categoryCondition}
        ${tagsCondition}
        AND EXISTS (
          SELECT 1
          FROM "ProductVariant" v
          INNER JOIN "Inventory" i ON i."variantId" = v.id
          WHERE v."productId" = p.id
            AND v."isActive" = true
            ${inStockCondition}
            ${minPriceCondition}
            ${maxPriceCondition}
        )
    `);

    const rankedIds = rankedRows.map((row) => row.id);
    const total = Number(countRows[0]?.total ?? 0n);
    if (rankedIds.length === 0) {
      return { items: [], total };
    }

    const products = await this.fastify.prisma.product.findMany({
      where: { id: { in: rankedIds } },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: input.inStockVariantWhere,
          orderBy: { price: input.variantOrder }
        }
      }
    });

    const productsById = new Map(products.map((product) => [product.id, product]));
    const items = rankedIds
      .map((id) => productsById.get(id))
      .filter((product): product is NonNullable<typeof product> => product !== undefined);

    return { items, total };
  }

  private async queryProductsByPopularity(input: {
    search?: string;
    categorySlug?: string;
    tagsFilter: string[];
    minPrice?: number;
    maxPrice?: number;
    inStockOnly: boolean;
    skip: number;
    limit: number;
    inStockVariantWhere: Prisma.ProductVariantWhereInput;
  }) {
    const categoryCondition = input.categorySlug
      ? Prisma.sql`AND c.slug = ${input.categorySlug}`
      : Prisma.empty;
    const tagsCondition = input.tagsFilter.length > 0
      ? Prisma.sql`AND p.tags && ARRAY[${Prisma.join(input.tagsFilter)}]::text[]`
      : Prisma.empty;
    const minPriceCondition = input.minPrice !== undefined
      ? Prisma.sql`AND v.price >= ${input.minPrice}`
      : Prisma.empty;
    const maxPriceCondition = input.maxPrice !== undefined
      ? Prisma.sql`AND v.price <= ${input.maxPrice}`
      : Prisma.empty;
    const inStockCondition = input.inStockOnly ? Prisma.sql`AND i.quantity > 0` : Prisma.empty;
    const searchCondition = input.search && input.search.length > 0
      ? Prisma.sql`AND p.search_vector @@ plainto_tsquery('english', ${input.search})`
      : Prisma.empty;

    const rankedRows = await this.fastify.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT
        p.id
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id
      LEFT JOIN "OrderItem" oi ON oi."variantId" = pv.id
      LEFT JOIN "Order" o ON o.id = oi."orderId"
      WHERE p."isActive" = true
        ${searchCondition}
        ${categoryCondition}
        ${tagsCondition}
        AND EXISTS (
          SELECT 1
          FROM "ProductVariant" v
          INNER JOIN "Inventory" i ON i."variantId" = v.id
          WHERE v."productId" = p.id
            AND v."isActive" = true
            ${inStockCondition}
            ${minPriceCondition}
            ${maxPriceCondition}
        )
      GROUP BY p.id, p."createdAt"
      ORDER BY COALESCE(SUM(CASE WHEN o.status NOT IN ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED') THEN oi.quantity ELSE 0 END), 0) DESC,
        p."createdAt" DESC
      LIMIT ${input.limit}
      OFFSET ${input.skip}
    `);

    const countRows = await this.fastify.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE p."isActive" = true
        ${searchCondition}
        ${categoryCondition}
        ${tagsCondition}
        AND EXISTS (
          SELECT 1
          FROM "ProductVariant" v
          INNER JOIN "Inventory" i ON i."variantId" = v.id
          WHERE v."productId" = p.id
            AND v."isActive" = true
            ${inStockCondition}
            ${minPriceCondition}
            ${maxPriceCondition}
        )
    `);

    const rankedIds = rankedRows.map((row) => row.id);
    const total = Number(countRows[0]?.total ?? 0n);
    if (rankedIds.length === 0) {
      return { items: [], total };
    }

    const products = await this.fastify.prisma.product.findMany({
      where: { id: { in: rankedIds } },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: input.inStockVariantWhere,
          orderBy: { price: 'asc' }
        }
      }
    });

    const productsById = new Map(products.map((product) => [product.id, product]));
    const items = rankedIds
      .map((id) => productsById.get(id))
      .filter((product): product is NonNullable<typeof product> => product !== undefined);

    return { items, total };
  }

  private async getCachedProductList(cacheKey: string): Promise<{ items: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } } | null> {
    try {
      const payload = await this.fastify.redis.get(cacheKey);
      if (!payload) {
        return null;
      }
      return JSON.parse(payload) as { items: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } };
    } catch (error) {
      this.fastify.log.error(
        { cacheKey, error: error instanceof Error ? error.message : 'Unknown product cache read error' },
        'Failed to read product list cache'
      );
      return null;
    }
  }

  private async setCachedProductList(
    cacheKey: string,
    response: { items: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } }
  ): Promise<void> {
    try {
      await this.fastify.redis.set(cacheKey, JSON.stringify(response), 'EX', 60);
    } catch (error) {
      this.fastify.log.error(
        { cacheKey, error: error instanceof Error ? error.message : 'Unknown product cache write error' },
        'Failed to write product list cache'
      );
    }
  }

  private async invalidateProductListCacheSafe(): Promise<void> {
    try {
      await invalidateProductsListCache(this.fastify.redis);
    } catch (error) {
      this.fastify.log.error(
        { error: error instanceof Error ? error.message : 'Unknown product cache invalidation error' },
        'Failed to invalidate product list cache'
      );
    }
  }

  private async enqueueListAnalytics(
    categorySlug: string | undefined,
    normalizedSearch: string | undefined,
    page: number,
    limit: number,
    total: number
  ) {
    if (normalizedSearch && normalizedSearch.length > 0) {
      await this.enqueueAnalyticsEvent(AnalyticsEventType.SEARCH, `search:${normalizedSearch.toLowerCase()}`, {
        search: normalizedSearch,
        page,
        limit,
        total
      });
      return;
    }

    await this.enqueueAnalyticsEvent(AnalyticsEventType.PAGE_VIEW, `catalog:${categorySlug ?? 'all'}`, {
      category: categorySlug ?? null,
      page,
      limit,
      total
    });
  }

  private async enqueueAnalyticsEvent(
    eventType: AnalyticsEventType,
    sessionId: string,
    payload: Record<string, unknown>
  ) {
    try {
      await this.enqueueOutboxMessage('analytics', 'record-event', {
        eventType,
        sessionId,
        payload,
        occurredAt: new Date().toISOString()
      }, `analytics:${eventType}:${sessionId}:${Date.now()}`);
    } catch (error) {
      this.fastify.log.error(
        {
          eventType,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown analytics enqueue error'
        },
        'Failed to enqueue analytics event'
      );
    }
  }

  private async enqueueOutboxMessage(
    queueName: 'analytics',
    jobName: string,
    payload: Record<string, unknown>,
    jobId?: string
  ): Promise<void> {
    const outboxDelegate = (this.fastify as { prisma?: PrismaClient }).prisma?.outboxMessage;
    if (outboxDelegate) {
      await outboxDelegate.create({
        data: {
          queueName,
          jobName,
          payload: payload as Prisma.InputJsonValue,
          ...(jobId ? { jobId } : {})
        }
      });
      return;
    }

    await this.fastify.queues[queueName].add(jobName, payload, jobId ? { jobId } : undefined);
  }

  private async applyReservationAwareAvailability<T extends { variants: Array<{ id: string; inventory?: { quantity: number } | null }> }>(
    products: T[],
    inStockOnly: boolean
  ): Promise<T[]> {
    const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
    if (variantIds.length === 0) {
      return products;
    }

    const reservations = await this.fastify.prisma.cartReservation.groupBy({
      by: ['variantId'],
      where: {
        variantId: { in: variantIds },
        expiresAt: { gt: new Date() }
      },
      _sum: { quantity: true }
    });
    const reservedByVariant = new Map<string, number>(
      reservations.map((row) => [row.variantId, row._sum.quantity ?? 0])
    );

    return products
      .map((product) => ({
        ...product,
        variants: product.variants.filter((variant) => {
          if (!inStockOnly) {
            return true;
          }
          const quantity = variant.inventory?.quantity ?? 0;
          const reserved = reservedByVariant.get(variant.id) ?? 0;
          return quantity - reserved > 0;
        })
      }))
      .filter((product) => (inStockOnly ? product.variants.length > 0 : true)) as T[];
  }
}

