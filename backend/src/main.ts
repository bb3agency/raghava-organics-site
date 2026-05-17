import Fastify from 'fastify';
import { getAppConfig, validateBootstrapEnv, validateRuntimeEnv } from '@config/app.config';
import { ERROR_CODES } from '@common/errors/error-codes';
import prismaClient from './database/prisma.service';
import { registerApp } from './app';
import { registerGlobalErrorHandler } from './common/errors/error-handler';
import { registerBullmqPlugin } from './common/plugins/bullmq.plugin';
import { registerCorsPlugin } from './common/plugins/cors.plugin';
import { registerHelmetPlugin } from './common/plugins/helmet.plugin';
import { registerJwtPlugin } from './common/plugins/jwt.plugin';
import { registerMultipartPlugin } from './common/plugins/multipart.plugin';
import { registerPrismaPlugin } from './common/plugins/prisma.plugin';
import { registerRateLimitPlugin } from './common/plugins/rate-limit.plugin';
import { registerRedisPlugin } from './common/plugins/redis.plugin';
import { registerSwaggerPlugin } from './common/plugins/swagger.plugin';
import { registerObservabilityPlugin } from './common/plugins/observability.plugin';
import { loadShedGuard } from '@common/reliability/load-shed.guard';
import { initializeTracing, shutdownTracing } from '@common/observability/tracing';
import { registerResponseEnvelopeHook } from '@common/hooks/response-envelope.hook';
import { featureFlags, refreshFeatureFlags } from '@config/feature-flags';
import { recordProcessCrash } from '@common/observability/metrics';
import { isIpAllowlisted, parseWebhookIpAllowlist } from '@common/security/webhook-allowlist';
import { applyOpsConfigRuntimeOverlay, type OpsConfigRuntimePrismaLike } from './modules/ops/ops-config-runtime';

function normalizeRoutePath(url: string): string {
  const rawPath = url.split('?')[0] ?? '';
  if (rawPath.length > 1 && rawPath.endsWith('/')) {
    return rawPath.slice(0, -1);
  }
  return rawPath;
}

async function bootstrap(): Promise<void> {
  validateBootstrapEnv();
  const overlayReport = await applyOpsConfigRuntimeOverlay(prismaClient as unknown as OpsConfigRuntimePrismaLike);
  refreshFeatureFlags();
  validateRuntimeEnv();
  const appConfig = getAppConfig();

  await initializeTracing();
  const trustedProxyRules = parseWebhookIpAllowlist(process.env.TRUSTED_PROXY_ALLOWLIST_CIDR);
  const trustProxy = trustedProxyRules.length > 0
    ? (address: string) => {
      const normalized = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
      return isIpAllowlisted(normalized, trustedProxyRules);
    }
    : false;
  const fastify = Fastify({
    // Explicit body limit — defense-in-depth; matches Fastify default but makes it
    // visible in code so a future Fastify upgrade cannot silently change it.
    bodyLimit: 1_048_576, // 1 MiB
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-ops-token"]',
          'req.headers["x-api-key"]',
          'req.headers["x-signature"]',
          'req.headers["x-webhook-signature"]',
          'req.headers["x-razorpay-signature"]',
          'req.headers["set-cookie"]',
          'res.headers["set-cookie"]',
          'authorization',
          'cookie',
          'token',
          '*.token',
          '*.sessionToken',
          '*.refreshToken',
          '*.signature',
          '*.secret',
          '*.apiKey'
        ],
        censor: '[REDACTED]'
      }
    },
    trustProxy,
    // Avoid 404s when clients or proxies add a trailing slash (e.g. `/api/v1/.../shipping/`).
    routerOptions: { ignoreTrailingSlash: true }
  });

  fastify.log.info({
    appliedKeys: overlayReport.appliedKeys,
    skippedBootstrapKeys: overlayReport.skippedBootstrapKeys,
    skippedUnknownKeys: overlayReport.skippedUnknownKeys,
    failedKeys: overlayReport.failedKeys
  }, 'Ops DB runtime config overlay applied');

  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Route not found',
        statusCode: 404,
        details: {
          kind: 'business_rule',
          hintKey: 'route_not_found',
          retryable: false,
          retryAfterSeconds: null,
          remediation: 'Verify HTTP method and API path.'
        }
      }
    });
  });

  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, payload, done) => {
      try {
        const routePath = normalizeRoutePath(request.url);
        const shouldKeepRawBody =
          routePath === '/api/v1/payments/webhook' ||
          routePath === '/api/v1/shipping/webhook' ||
          routePath === '/api/v1/notifications/webhook/meta-whatsapp';

        if (shouldKeepRawBody) {
          // Preserve the exact raw bytes for HMAC signature verification.
          // Converting to string and back risks subtle byte-level mismatches
          // that would cause Razorpay webhook signature validation to fail.
          done(null, payload);
          return;
        }

        const parsed = JSON.parse(payload.toString('utf8')) as unknown;
        done(null, parsed);
      } catch (error) {
        done(error as Error);
      }
    }
  );

  // Locked order from TRD §4.2 / rules §7:
  // helmet -> cors -> jwt -> rate-limit -> multipart -> swagger -> prisma -> redis -> bullmq -> modules
  await registerHelmetPlugin(fastify);
  await registerCorsPlugin(fastify);
  await registerJwtPlugin(fastify);
  await registerRateLimitPlugin(fastify);
  await registerMultipartPlugin(fastify);
  await registerSwaggerPlugin(fastify);
  await registerPrismaPlugin(fastify);
  await registerRedisPlugin(fastify);
  await registerBullmqPlugin(fastify);
  await registerGlobalErrorHandler(fastify);
  await registerObservabilityPlugin(fastify);
  fastify.addHook('preHandler', loadShedGuard);
  await registerApp(fastify);

  // Response envelope — wraps all 2xx JSON responses in { success, data, meta? }
  // Activate per-client via FEATURE_RESPONSE_ENVELOPE_ENABLED=true
  if (featureFlags.responseEnvelope) {
    await registerResponseEnvelopeHook(fastify);
  }

  // Graceful shutdown — defined before listen() so crash handlers can reference it.
  let shuttingDown = false;
  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await fastify.close();
    await shutdownTracing();
  };

  await fastify.listen({
    host: appConfig.host,
    port: appConfig.port
  });

  // --- Signal handlers ---
  process.once('SIGINT', () => {
    void gracefulShutdown();
  });
  process.once('SIGTERM', () => {
    void gracefulShutdown();
  });

  // --- Process crash boundary handlers ---
  // Node 22 defaults to --unhandled-rejections=throw; without these handlers an
  // unhandled rejection in any async path (plugin, hook, background timer) kills
  // the process silently. We log and initiate an orderly shutdown instead.
  process.on('unhandledRejection', (reason: unknown) => {
    fastify.log.fatal({ reason }, 'Unhandled promise rejection — initiating shutdown');
    recordProcessCrash('unhandled_rejection');
    void gracefulShutdown().finally(() => process.exit(1));
  });

  process.on('uncaughtException', (error: Error) => {
    fastify.log.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception — initiating shutdown');
    recordProcessCrash('uncaught_exception');
    void gracefulShutdown().finally(() => process.exit(1));
  });
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
