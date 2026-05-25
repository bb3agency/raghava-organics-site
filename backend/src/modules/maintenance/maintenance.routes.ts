import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  isMaintenanceActive,
  readMaintenanceStateFromRequest
} from '@common/reliability/maintenance-state';
import { shouldBlockForMaintenance } from '@common/reliability/load-shed.guard';

/**
 * Routes that power the storefront maintenance banner and the Nginx
 * `auth_request` gating that serves the static `maintenance.html` page
 * for all non-ops traffic during `maintenance` mode phase `active`.
 *
 * Public endpoints (no auth):
 *   - GET /api/v1/maintenance/status — JSON snapshot the frontend banner
 *     polls every few seconds to render the countdown / active message.
 *     Returns 200 with current mode/phase/timestamps even when maintenance
 *     is active (it is listed in `ALWAYS_ALLOWED_PREFIXES`).
 *
 *   - GET /api/v1/maintenance/gate  — Nginx `auth_request` subrequest.
 *     Nginx forwards every storefront/admin request to this URL with the
 *     original URI in `X-Original-URI`. We respond:
 *       200 → Nginx forwards the original request upstream.
 *       503 → Nginx renders the static maintenance page from the existing
 *             `error_page 502 503 /maintenance.html` directive.
 *     The gate runs inside `loadShedGuard`'s ALWAYS_ALLOWED set so its own
 *     evaluation never goes recursive during maintenance.
 *
 * Neither route is enveloped — they must be parsable by Nginx (which only
 * inspects the HTTP status) and by the public banner client that hits the
 * route directly without going through the storefront's API helper.
 */
export async function registerMaintenanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/maintenance/status',
    {
      // No rate limit — banner polls this every 10s from every active tab.
      // Keeping it ungated avoids a thundering herd of 429s on the very
      // moment maintenance flips, which is exactly when the UX matters most.
      config: { rateLimit: false },
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            // `serverTime` is required so the storefront banner can always
            // align its countdown with the server clock; missing it would
            // cause Fastify's strict response serializer to drop the field
            // even when the handler populated it, leading to drifted
            // countdowns on devices with skewed clocks.
            required: ['mode', 'phase', 'pendingUntil', 'activatedAt', 'serverTime'],
            properties: {
              mode: { type: 'string', enum: ['normal', 'reduced', 'emergency', 'maintenance'], maxLength: 20 },
              phase: { type: ['string', 'null'], enum: ['pending', 'active', null], maxLength: 16 },
              pendingUntil: { type: ['string', 'null'], maxLength: 40 },
              activatedAt: { type: ['string', 'null'], maxLength: 40 },
              serverTime: { type: 'string', maxLength: 40 }
            }
          }
        }
      }
    },
    async (request: FastifyRequest) => {
      const state = await readMaintenanceStateFromRequest(request);
      return {
        mode: state.mode,
        phase: state.phase,
        pendingUntil: state.pendingUntil,
        activatedAt: state.activatedAt,
        serverTime: new Date().toISOString()
      };
    }
  );

  /**
   * Nginx `auth_request` gate. Always returns 200 (the `auth_request`
   * directive on `location` blocks only treats 2xx as "allow") but signals
   * the maintenance decision via the `X-Maintenance-Active` response
   * header:
   *
   *   X-Maintenance-Active: 0 → Nginx proxies the original request upstream.
   *   X-Maintenance-Active: 1 → Nginx `auth_request_set` captures the value,
   *                              an `if ($maintenance_active = "1") { return 503; }`
   *                              fires, and the `error_page 502 503` chain
   *                              serves the static maintenance.html.
   *
   * Why a header and not a 4xx status: `auth_request` collapses anything
   * other than 200/401/403 into a 500 on the client. Returning 401/403
   * would conflict with genuine auth failures from upstream routes (Nginx
   * can't tell whether the 401 originated from the gate or from the real
   * proxy_pass response, so an `error_page 401 = /maintenance.html`
   * mapping would shadow real auth UX). The header pattern is invisible to
   * the rest of Nginx and only affects locations that explicitly capture
   * `$upstream_http_x_maintenance_active`.
   *
   * The subrequest is internal (`internal;` in Nginx) so it cannot be hit
   * directly. We still read `X-Original-URI` (set by Nginx) so the gate
   * permits ALWAYS_ALLOWED prefixes (e.g. `/api/v1/ops/...`,
   * `/api/v1/health`, webhooks, `/api/v1/maintenance`) during active
   * maintenance, even though the Nginx location-level routing also exempts
   * those paths. Defense-in-depth in case someone wires the gate onto an
   * additional location later.
   */
  fastify.get(
    '/api/v1/maintenance/gate',
    {
      // No rate limit — Nginx fires this once per upstream request, which is
      // already shaped by the location-level zones.
      config: { rateLimit: false },
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { allowed: { type: 'boolean' } }
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const state = await readMaintenanceStateFromRequest(request);

      if (!isMaintenanceActive(state)) {
        reply.header('X-Maintenance-Active', '0');
        return { allowed: true };
      }

      const originalUri =
        (request.headers['x-original-uri'] as string | undefined) ??
        (request.headers['x-original-url'] as string | undefined) ??
        '';

      // Strip query string before matching prefixes — `ALWAYS_ALLOWED_PREFIXES`
      // are path-only ("/api/v1/ops"), and matching against a URI with query
      // would falsely block ops UI calls that include `?page=…`.
      const pathOnly = originalUri.split('?')[0] ?? '';

      if (shouldBlockForMaintenance(state, pathOnly)) {
        reply.header('X-Maintenance-Active', '1');
        return { allowed: false };
      }
      reply.header('X-Maintenance-Active', '0');
      return { allowed: true };
    }
  );
}
