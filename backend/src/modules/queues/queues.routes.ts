import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';
import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { adminQueuesUiSchema, adminQueuesDlqSummarySchema } from './queues.schemas';

export async function registerQueuesRoutes(fastify: FastifyInstance): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/api/v1/admin/queues');

  const registryQueues = Object.values(fastify.queues).map((queue) => new BullMQAdapter(queue));

  createBullBoard({
    queues: registryQueues as never,
    serverAdapter
  });

  await fastify.register(async (secured) => {
    secured.addHook('onRoute', (routeOptions) => {
      if (
        routeOptions.method === 'GET' &&
        typeof routeOptions.url === 'string' &&
        routeOptions.url === '/api/v1/admin/queues'
      ) {
        routeOptions.schema = adminQueuesUiSchema;
      }
    });

    secured.addHook('onRequest', async (request, reply) => {
      await jwtAuthGuard(request, reply);
      await rolesGuard(Role.ADMIN)(request, reply);
      await adminPermissionGuard('queues:inspect')(request, reply);
    });

    secured.get('/api/v1/admin/queues/dlq/summary', {
      schema: adminQueuesDlqSummarySchema,
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      },
      handler: async () => {
        const dlq: Queue | undefined = fastify.queues.deadLetter;
        if (!dlq) {
          return { total: 0, bySourceQueue: {} };
        }

        const waiting = await dlq.getWaiting(0, 500);
        const completed = await dlq.getCompleted(0, 500);
        const allJobs = [...waiting, ...completed];

        const bySourceQueue: Record<string, number> = {};
        for (const job of allJobs) {
          const source = (job.data as { sourceQueue?: string })?.sourceQueue ?? 'unknown';
          bySourceQueue[source] = (bySourceQueue[source] ?? 0) + 1;
        }

        return { total: allJobs.length, bySourceQueue };
      }
    });

    await secured.register(serverAdapter.registerPlugin(), {
      prefix: '/api/v1/admin/queues'
    } as never);
  });
}

