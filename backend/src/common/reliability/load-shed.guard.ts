import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';

export const LOAD_SHED_MODE_KEY = 'ops:load_shed:mode';
const NON_CRITICAL_ADMIN_PREFIXES = [
  '/api/v1/admin/analytics',
  '/api/v1/admin/dashboard',
  '/api/v1/admin/coupons',
  '/api/v1/admin/settings',
  '/api/v1/admin/inventory',
  '/api/v1/admin/reviews',
  '/api/v1/admin/users',
  '/api/v1/admin/products',
  '/api/v1/admin/categories',
  '/api/v1/admin/orders/export'
];
const REDUCED_MODE_MUTATION_PREFIXES = ['/api/v1/orders', '/api/v1/payments/initiate', '/api/v1/cart'];
const ALWAYS_ALLOWED_PREFIXES = ['/api/v1/health', '/api/v1/auth', '/api/v1/payments/webhook', '/api/v1/shipping/webhook'];

let cachedMode = 'normal';
let cachedAt = 0;

async function resolveLoadShedMode(request: FastifyRequest): Promise<'normal' | 'reduced' | 'emergency'> {
  const now = Date.now();
  if (now - cachedAt < 5000) {
    return cachedMode as 'normal' | 'reduced' | 'emergency';
  }

  const fromEnv = process.env.LOAD_SHED_MODE?.trim().toLowerCase();
  if (fromEnv === 'reduced' || fromEnv === 'emergency') {
    cachedMode = fromEnv;
    cachedAt = now;
    return cachedMode as 'normal' | 'reduced' | 'emergency';
  }

  try {
    const fromRedis = (await request.server.redis.get(LOAD_SHED_MODE_KEY))?.trim().toLowerCase();
    cachedMode = fromRedis === 'reduced' || fromRedis === 'emergency' ? fromRedis : 'normal';
  } catch {
    cachedMode = 'normal';
  }
  cachedAt = now;
  return cachedMode as 'normal' | 'reduced' | 'emergency';
}

export async function getLoadShedMode(request: FastifyRequest): Promise<'normal' | 'reduced' | 'emergency'> {
  return resolveLoadShedMode(request);
}

export async function setLoadShedMode(
  request: FastifyRequest,
  mode: 'normal' | 'reduced' | 'emergency'
): Promise<void> {
  await request.server.redis.set(LOAD_SHED_MODE_KEY, mode);
  cachedMode = mode;
  cachedAt = Date.now();
}

/**
 * Sets the load-shed mode via a raw Redis client.
 *
 * For service-layer callers (e.g. `scheduleRestart`) and worker processes
 * where a `FastifyRequest` is not available. Updates both Redis and the
 * in-process cache immediately so subsequent `loadShedGuard` calls within the
 * same process see the new mode without waiting for the 5-second cache TTL.
 *
 * @param redis - Any object exposing a `set(key, value)` Redis command.
 * @param mode  - The load-shed mode to apply.
 */
export async function setLoadShedModeViaRedis(
  redis: { set: (key: string, value: string) => Promise<unknown> },
  mode: 'normal' | 'reduced' | 'emergency'
): Promise<void> {
  await redis.set(LOAD_SHED_MODE_KEY, mode);
  cachedMode = mode;
  cachedAt = Date.now();
}

export async function loadShedGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const route = typeof request.routeOptions.url === 'string' ? request.routeOptions.url : request.url;
  if (ALWAYS_ALLOWED_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    return;
  }

  const mode = await resolveLoadShedMode(request);
  const isNonCriticalAdmin = NON_CRITICAL_ADMIN_PREFIXES.some((prefix) => route.startsWith(prefix));
  const isCheckoutMutation = REDUCED_MODE_MUTATION_PREFIXES.some((prefix) => route.startsWith(prefix))
    && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);

  if (mode === 'emergency' && (isNonCriticalAdmin || isCheckoutMutation)) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Emergency degraded mode enabled. Non-critical and mutation traffic is temporarily shed.',
      503
    );
  }
  if (mode === 'reduced' && isNonCriticalAdmin) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Temporarily degraded mode for non-critical admin reports. Please retry shortly.',
      503
    );
  }
}
