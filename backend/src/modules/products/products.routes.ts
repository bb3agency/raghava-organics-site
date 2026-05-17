import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import {
  adminCreateProductImageSchema,
  adminGetProductByIdSchema,
  adminImportProductsCsvSchema,
  adminListCategoriesSchema,
  adminListProductsSchema,
  adminCreateCategorySchema,
  adminCreateProductSchema,
  adminCreateProductVariantSchema,
  adminDeleteCategorySchema,
  adminDeleteProductSchema,
  adminUpdateCategorySchema,
  adminUpdateProductSchema,
  adminUpdateProductVariantSchema,
  adminReorderProductImagesSchema,
  adminDeleteProductImageSchema,
  getProductBySlugSchema,
  listCategoriesSchema,
  listProductsByCategorySchema,
  listProductsSchema
} from './products.schemas';
import { ProductsService } from './products.service';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';

export async function registerProductsRoutes(fastify: FastifyInstance): Promise<void> {
  const productsService = new ProductsService(fastify);

  fastify.get(
    '/api/v1/products',
    {
      schema: listProductsSchema,
      config: {
        rateLimit: routeRateLimitProfiles.catalogRead
      }
    },
    async (request) => productsService.listProducts(request.query as never)
  );

  fastify.get(
    '/api/v1/products/categories',
    {
      schema: listCategoriesSchema,
      config: {
        rateLimit: routeRateLimitProfiles.catalogRead
      }
    },
    async () => productsService.listCategories()
  );

  fastify.get(
    '/api/v1/products/categories/:slug/products',
    {
      schema: listProductsByCategorySchema,
      config: {
        rateLimit: routeRateLimitProfiles.catalogRead
      }
    },
    async (request) => {
      const params = request.params as { slug: string };
      return productsService.listProducts(request.query as never, params.slug);
    }
  );

  fastify.get(
    '/api/v1/products/:slug',
    {
      schema: getProductBySlugSchema,
      config: {
        rateLimit: routeRateLimitProfiles.catalogRead
      }
    },
    async (request) => {
      const params = request.params as { slug: string };
      return productsService.getProductBySlug(params.slug);
    }
  );

  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN)];

  fastify.get(
    '/api/v1/admin/products',
    {
      schema: adminListProductsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => productsService.adminListProducts(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/products/:id',
    {
      schema: adminGetProductByIdSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminGetProductById(params.id);
    }
  );

  fastify.post(
    '/api/v1/admin/products/import-csv',
    {
      schema: adminImportProductsCsvSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      if (!request.isMultipart()) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'CSV upload requires multipart/form-data', 400);
      }

      const file = await request.file();
      if (!file) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Missing CSV file', 400);
      }

      const csvBuffer = await file.toBuffer();
      const csv = csvBuffer.toString('utf8');
      if (csv.trim().length === 0) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'CSV file is empty', 400);
      }

      return productsService.adminImportProductsCsv({ csv });
    }
  );

  fastify.post(
    '/api/v1/admin/products',
    {
      schema: adminCreateProductSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => productsService.adminCreateProduct(request.body as never)
  );

  fastify.patch(
    '/api/v1/admin/products/:id/variants/:variantId',
    {
      schema: adminUpdateProductVariantSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string; variantId: string };
      return productsService.adminUpdateProductVariant(params.id, params.variantId, request.body as never);
    }
  );

  fastify.post(
    '/api/v1/admin/products/:id/variants',
    {
      schema: adminCreateProductVariantSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminCreateProductVariant(params.id, request.body as never);
    }
  );

  fastify.patch(
    '/api/v1/admin/products/:id',
    {
      schema: adminUpdateProductSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminUpdateProduct(params.id, request.body as never);
    }
  );

  fastify.post(
    '/api/v1/admin/products/:id/images',
    {
      schema: adminCreateProductImageSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminCreateProductImage(params.id, request.body as never);
    }
  );

  fastify.patch(
    '/api/v1/admin/products/:id/images/reorder',
    {
      schema: adminReorderProductImagesSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminReorderProductImages(params.id, request.body as never);
    }
  );

  fastify.delete(
    '/api/v1/admin/products/:id/images/:imageId',
    {
      schema: adminDeleteProductImageSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string; imageId: string };
      return productsService.adminDeleteProductImage(params.id, params.imageId);
    }
  );

  fastify.delete(
    '/api/v1/admin/products/:id',
    {
      schema: adminDeleteProductSchema,
      preHandler: [...adminGuard, adminPermissionGuard('products:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminDeleteProduct(params.id);
    }
  );

  fastify.get(
    '/api/v1/admin/categories',
    {
      schema: adminListCategoriesSchema,
      preHandler: [...adminGuard, adminPermissionGuard('categories:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => productsService.adminListCategories(request.query as never)
  );

  fastify.post(
    '/api/v1/admin/categories',
    {
      schema: adminCreateCategorySchema,
      preHandler: [...adminGuard, adminPermissionGuard('categories:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => productsService.adminCreateCategory(request.body as never)
  );

  fastify.patch(
    '/api/v1/admin/categories/:id',
    {
      schema: adminUpdateCategorySchema,
      preHandler: [...adminGuard, adminPermissionGuard('categories:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminUpdateCategory(params.id, request.body as never);
    }
  );

  fastify.delete(
    '/api/v1/admin/categories/:id',
    {
      schema: adminDeleteCategorySchema,
      preHandler: [...adminGuard, adminPermissionGuard('categories:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return productsService.adminDeleteCategory(params.id);
    }
  );
}

