import { AnalyticsEventType, Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { idempotencyOnSend, idempotencyPreHandler } from '@common/idempotency/idempotency';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { loadShedGuard } from '@common/reliability/load-shed.guard';
import {
  analyticsCategoryBreakdownSchema,
  analyticsEventRecordSchema,
  analyticsFunnelSchema,
  analyticsInventoryAlertsSchema,
  analyticsInboxReplaySchema,
  analyticsInboxReplayPreviewSchema,
  analyticsInboxFailuresSchema,
  analyticsNotificationsSchema,
  analyticsOutboxDeadLettersSchema,
  analyticsOutboxReplayPreviewSchema,
  analyticsOutboxReplaySchema,
  analyticsReconciliationIssuesSchema,
  analyticsRevenueCsvSchema,
  analyticsRevenueSchema
} from './analytics.schemas';
import { AnalyticsService } from './analytics.service';

export async function registerAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AnalyticsService(fastify);
  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN), loadShedGuard];
  fastify.addHook('onSend', async (request, reply, payload) => {
    await idempotencyOnSend(request, reply, payload);
    return payload;
  });

  // ── Public event ingestion (storefront → analytics) ─────────────────────
  fastify.post(
    '/api/v1/analytics/event',
    {
      schema: analyticsEventRecordSchema,
      config: {
        rateLimit: routeRateLimitProfiles.cartOps
      }
    },
    async (request, reply) => {
      const body = request.body as {
        eventType: string;
        sessionId: string;
        userId?: string;
        payload?: Record<string, unknown>;
      };
      const result = await service.recordEvent({
        eventType: body.eventType as AnalyticsEventType,
        sessionId: body.sessionId,
        ...(body.userId ? { userId: body.userId } : {}),
        ...(body.payload ? { payload: body.payload } : {})
      });
      reply.status(201);
      return result;
    }
  );

  fastify.get(
    '/api/v1/admin/analytics/revenue',
    {
      schema: analyticsRevenueSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.getRevenue(request.query as never)
  );

  fastify.post(
    '/api/v1/admin/analytics/outbox-dead-letter/:id/replay-preview',
    {
      schema: analyticsOutboxReplayPreviewSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      const requester = (request as { user?: { sub?: string } }).user?.sub ?? 'admin';
      return service.previewOutboxDeadLetterReplay({
        outboxMessageId: params.id,
        requestedBy: requester
      });
    }
  );

  fastify.post(
    '/api/v1/admin/analytics/outbox-dead-letter/:id/replay',
    {
      schema: analyticsOutboxReplaySchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as { reason?: string; dryRun?: boolean; approvalToken?: string };
      const requester = (request as { user?: { sub?: string } }).user?.sub ?? 'admin';
      return service.replayOutboxDeadLetter({
        outboxMessageId: params.id,
        requestedBy: requester,
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.dryRun !== undefined ? { dryRun: body.dryRun } : {}),
        ...(body.approvalToken ? { approvalToken: body.approvalToken } : {})
      });
    }
  );

  fastify.get(
    '/api/v1/admin/analytics/outbox-dead-letter',
    {
      schema: analyticsOutboxDeadLettersSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.listOutboxDeadLetters(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/analytics/inbox-failures',
    {
      schema: analyticsInboxFailuresSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.listWebhookInboxFailures(request.query as never)
  );

  fastify.post(
    '/api/v1/admin/analytics/inbox-failures/:id/replay-preview',
    {
      schema: analyticsInboxReplayPreviewSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      const requester = (request as { user?: { sub?: string } }).user?.sub ?? 'admin';
      return service.previewInboxFailureReplay({
        inboxEventId: params.id,
        requestedBy: requester
      });
    }
  );

  fastify.post(
    '/api/v1/admin/analytics/inbox-failures/:id/replay',
    {
      schema: analyticsInboxReplaySchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:replay'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as {
        reason?: string;
        dryRun?: boolean;
        approvalToken?: string;
        operationType?: 'canonical_reprocess' | 'mark_processing';
        rawPayload?: string;
        verificationHeader?: string;
      };
      const requester = (request as { user?: { sub?: string } }).user?.sub ?? 'admin';
      return service.replayInboxFailure({
        inboxEventId: params.id,
        requestedBy: requester,
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.dryRun !== undefined ? { dryRun: body.dryRun } : {}),
        ...(body.approvalToken ? { approvalToken: body.approvalToken } : {}),
        ...(body.operationType ? { operationType: body.operationType } : {}),
        ...(body.rawPayload ? { rawPayload: body.rawPayload } : {}),
        ...(body.verificationHeader ? { verificationHeader: body.verificationHeader } : {})
      });
    }
  );

  fastify.get(
    '/api/v1/admin/analytics/revenue/export',
    {
      schema: analyticsRevenueCsvSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:export')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request, reply) => {
      const csv = await service.exportRevenueCsv(request.query as never);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="analytics-revenue.csv"');
      return reply.send(csv);
    }
  );

  fastify.get(
    '/api/v1/admin/analytics/funnel',
    {
      schema: analyticsFunnelSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.getFunnel(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/analytics/inventory-alerts',
    {
      schema: analyticsInventoryAlertsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => service.getInventoryAlerts()
  );

  fastify.get(
    '/api/v1/admin/analytics/notifications',
    {
      schema: analyticsNotificationsSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.getNotificationDeliveryStats(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/analytics/reconciliation-issues',
    {
      schema: analyticsReconciliationIssuesSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.listReconciliationIssues(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/analytics/category-breakdown',
    {
      schema: analyticsCategoryBreakdownSchema,
      preHandler: [...adminGuard, adminPermissionGuard('analytics:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => service.getCategoryBreakdown(request.query as never)
  );
}

