import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import {
  listInventorySchema,
  lowStockSchema,
  updateInventorySchema
} from './inventory.schemas';
import { InventoryService } from './inventory.service';

export async function registerInventoryRoutes(fastify: FastifyInstance): Promise<void> {
  const inventoryService = new InventoryService(fastify);
  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN)];

  fastify.get(
    '/api/v1/admin/inventory',
    {
      schema: listInventorySchema,
      preHandler: [...adminGuard, adminPermissionGuard('inventory:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => inventoryService.listInventory(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/inventory/low-stock',
    {
      schema: lowStockSchema,
      preHandler: [...adminGuard, adminPermissionGuard('inventory:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => inventoryService.listLowStock()
  );

  fastify.patch(
    '/api/v1/admin/inventory/:variantId',
    {
      schema: updateInventorySchema,
      preHandler: [...adminGuard, adminPermissionGuard('inventory:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { variantId: string };
      return inventoryService.updateInventory(params.variantId, request.body as never);
    }
  );

}

