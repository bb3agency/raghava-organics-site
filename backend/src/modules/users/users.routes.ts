import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { getCurrentUser } from '@common/decorators/current-user';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import {
  adminGetUserByIdSchema,
  adminListUsersSchema,
  createAddressSchema,
  deleteAddressSchema,
  getMeSchema,
  listAddressesSchema,
  listOrdersSchema,
  patchMeSchema,
  updateAddressSchema
} from './users.schemas';
import { UsersService } from './users.service';

export async function registerUsersRoutes(fastify: FastifyInstance): Promise<void> {
  const usersService = new UsersService(fastify);
  const customerGuard = [jwtAuthGuard, rolesGuard(Role.CUSTOMER)];

  fastify.get(
    '/api/v1/users/me',
    {
      schema: getMeSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return usersService.getMe(user.sub);
    }
  );

  fastify.patch(
    '/api/v1/users/me',
    {
      schema: patchMeSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return usersService.patchMe(user.sub, request.body as never);
    }
  );

  fastify.get(
    '/api/v1/users/me/addresses',
    {
      schema: listAddressesSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return usersService.listAddresses(user.sub, request.query as never);
    }
  );

  fastify.post(
    '/api/v1/users/me/addresses',
    {
      schema: createAddressSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return usersService.createAddress(user.sub, request.body as never);
    }
  );

  fastify.patch(
    '/api/v1/users/me/addresses/:id',
    {
      schema: updateAddressSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      return usersService.updateAddress(user.sub, params.id, request.body as never);
    }
  );

  fastify.delete(
    '/api/v1/users/me/addresses/:id',
    {
      schema: deleteAddressSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      return usersService.deleteAddress(user.sub, params.id);
    }
  );

  fastify.get(
    '/api/v1/users/me/orders',
    {
      schema: listOrdersSchema,
      preHandler: customerGuard,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return usersService.listOrders(user.sub, request.query as never);
    }
  );

  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN)];

  fastify.get(
    '/api/v1/admin/users',
    {
      schema: adminListUsersSchema,
      preHandler: [...adminGuard, adminPermissionGuard('users:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => usersService.adminListUsers(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/users/:id',
    {
      schema: adminGetUserByIdSchema,
      preHandler: [...adminGuard, adminPermissionGuard('users:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return usersService.adminGetUserById(params.id);
    }
  );
}

