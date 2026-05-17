import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import {
  getInventorySettingsSchema,
  getNotificationSettingsSchema,
  getShippingSettingsSchema,
  getStoreProfileSchema,
  updateInventorySettingsSchema,
  updateNotificationSettingsSchema,
  updateShippingSettingsSchema,
  updateStoreProfileSchema
} from './settings.schemas';
import { SettingsService } from './settings.service';

export async function registerSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  const settingsService = new SettingsService(fastify);
  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN)];

  fastify.get(
    '/api/v1/admin/settings/shipping',
    {
      schema: getShippingSettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => settingsService.getShippingSettings()
  );

  fastify.patch(
    '/api/v1/admin/settings/shipping',
    {
      schema: updateShippingSettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => settingsService.updateShippingSettings(request.body as never)
  );

  fastify.get(
    '/api/v1/admin/settings/store',
    {
      schema: getStoreProfileSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => settingsService.getStoreProfile()
  );

  fastify.patch(
    '/api/v1/admin/settings/store',
    {
      schema: updateStoreProfileSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => settingsService.updateStoreProfile(request.body as never)
  );

  fastify.get(
    '/api/v1/admin/settings/notifications',
    {
      schema: getNotificationSettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => settingsService.getNotificationSettings()
  );

  fastify.patch(
    '/api/v1/admin/settings/notifications',
    {
      schema: updateNotificationSettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => settingsService.updateNotificationSettings(request.body as never)
  );

  fastify.get(
    '/api/v1/admin/settings/inventory',
    {
      schema: getInventorySettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => settingsService.getInventorySettings()
  );

  fastify.patch(
    '/api/v1/admin/settings/inventory',
    {
      schema: updateInventorySettingsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('settings:write')],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => settingsService.updateInventorySettings(request.body as never)
  );

  fastify.get(
    '/api/v1/admin/settings/cod',
    {
      schema: {
        tags: ['admin', 'settings'],
        summary: 'Get COD and cancellation settings',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['isCodEnabled', 'cancellationWindowHours'],
            properties: {
              isCodEnabled: { type: 'boolean' },
              cancellationWindowHours: { type: 'integer', minimum: 1 },
              sellerState: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] }
            }
          }
        }
      },
      preHandler: [...adminGuard, adminPermissionGuard('settings:read')],
      config: { rateLimit: routeRateLimitProfiles.adminRead }
    },
    async () => settingsService.getCodSettings()
  );

  fastify.patch(
    '/api/v1/admin/settings/cod',
    {
      schema: {
        tags: ['admin', 'settings'],
        summary: 'Update COD and cancellation settings',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            isCodEnabled: { type: 'boolean' },
            cancellationWindowHours: { type: 'integer', minimum: 1, maximum: 720 },
            sellerState: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['isCodEnabled', 'cancellationWindowHours'],
            properties: {
              isCodEnabled: { type: 'boolean' },
              cancellationWindowHours: { type: 'integer', minimum: 1 },
              sellerState: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] }
            }
          }
        }
      },
      preHandler: [...adminGuard, adminPermissionGuard('settings:write')],
      config: { rateLimit: routeRateLimitProfiles.adminWrite }
    },
    async (request) => settingsService.updateCodSettings(request.body as never)
  );
}
