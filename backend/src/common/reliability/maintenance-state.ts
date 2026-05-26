/**
 * Durable maintenance/load-shed state access layer.
 *
 * Postgres (`MaintenanceState` singleton row) is the source of truth.
 * Redis is the fast read cache populated from Postgres on miss/boot.
 *
 * Mode taxonomy (extends load-shed):
 *   - normal     : full traffic, no degradation.
 *   - reduced    : non-critical admin reports + analytics paths shed.
 *   - emergency  : checkout mutations + non-critical admin paths shed.
 *   - maintenance: scheduled downtime; survives Redis loss and process restart
 *                  until an ops user explicitly switches back to normal/reduced/
 *                  emergency. Behaviour depends on the phase below.
 *
 * Maintenance phases (only meaningful when mode === 'maintenance'):
 *   - pending : 2-minute warning window. Storefront still responds (with a
 *               banner), payment-in-flight jobs continue, new mutations are
 *               blocked just like emergency mode. A delayed activation job
 *               flips this to 'active' after the queue + payment drain
 *               completes.
 *   - active  : full maintenance. Nginx serves the static maintenance page
 *               for every non-ops, non-health, non-webhook route via the
 *               internal `/maintenance-check` auth_request.
 *
 * The Redis cache is a single JSON blob at `MAINTENANCE_STATE_REDIS_KEY` plus
 * a 5-second in-process memo to keep hot-path reads (load-shed guard,
 * maintenance check) free of network calls in steady state.
 */

import type { FastifyRequest } from 'fastify';

export const LOAD_SHED_MODES = ['normal', 'reduced', 'emergency', 'maintenance'] as const;
export type LoadShedModeWithMaintenance = (typeof LOAD_SHED_MODES)[number];

export const MAINTENANCE_PHASES = ['pending', 'active'] as const;
export type MaintenancePhase = (typeof MAINTENANCE_PHASES)[number];

export const MAINTENANCE_STATE_REDIS_KEY = 'ops:maintenance:state';
export const MAINTENANCE_STATE_SINGLETON_KEY = 'singleton';

/**
 * Default warning window before maintenance becomes active. Operators get
 * exactly this long after `setMode('maintenance')` for the storefront banner
 * to surface to logged-in users before Nginx starts serving the
 * maintenance page.
 */
export const DEFAULT_MAINTENANCE_PENDING_WINDOW_MS = 2 * 60 * 1000;

/**
 * Grace window applied on top of `pendingUntil` before the read path will
 * self-heal a stuck `pending` state by auto-promoting it to `active`.
 *
 * The healthy path is: worker picks up the `maintenance-activation` BullMQ
 * job exactly at `pendingUntil`, drains the queues + payments, and writes
 * `phase = 'active'`. The drain has its own timeouts
 * (`RESTART_QUEUE_DRAIN_TIMEOUT_MS` + `RESTART_PAYMENT_DRAIN_TIMEOUT_MS`,
 * worst case 1 min queue + 5 min payments = 6 min), so within ~6.5 min of
 * `pendingUntil` the worker will have written `active` itself.
 *
 * The fallback fires only if the worker is unhealthy: image not rebuilt
 * after pulling the maintenance code, worker container in a crash loop,
 * BullMQ Redis lost the job, or the operator hand-edited the row. After
 * `pendingUntil + GRACE`, every read of the state auto-promotes it to
 * `active` and persists the new row, so Nginx + the API guard can finally
 * start blocking traffic. This is the "system cannot get stuck in pending"
 * contract that the design promises to ops.
 *
 * The grace must be larger than the worst-case healthy drain so we don't
 * race the worker, but small enough that a misbehaving worker doesn't keep
 * the storefront accessible for an unbounded time. 7 min covers the worst
 * case (6 min: 60s queue drain + 5 min payment drain) plus a ~1 min cushion
 * for Redis hiccups and BullMQ delayed-job polling jitter. Override via
 * `MAINTENANCE_ACTIVATION_GRACE_MS` env var if your tenant runs custom
 * drain timeouts.
 */
export const DEFAULT_MAINTENANCE_ACTIVATION_GRACE_MS = 7 * 60 * 1000;

/**
 * Resolves the activation grace from the env var or falls back to the
 * default. Called per-read so config changes don't require a restart.
 */
export function resolveMaintenanceActivationGraceMs(): number {
  const raw = process.env['MAINTENANCE_ACTIVATION_GRACE_MS'];
  if (!raw) return DEFAULT_MAINTENANCE_ACTIVATION_GRACE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MAINTENANCE_ACTIVATION_GRACE_MS;
  }
  return parsed;
}

export interface MaintenanceStateRecord {
  mode: LoadShedModeWithMaintenance;
  phase: MaintenancePhase | null;
  /** ISO-8601 — when phase 'pending' is scheduled to flip to 'active' (after drain). */
  pendingUntil: string | null;
  /** ISO-8601 — when phase actually became 'active'. */
  activatedAt: string | null;
  reason: string | null;
  setByOpsUserId: string | null;
  /** ISO-8601 — when this state row was last written. */
  setAt: string;
  updatedAt: string;
}

const DEFAULT_STATE: MaintenanceStateRecord = {
  mode: 'normal',
  phase: null,
  pendingUntil: null,
  activatedAt: null,
  reason: null,
  setByOpsUserId: null,
  setAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

/**
 * Minimal Prisma shape we need — typed locally so this module does not depend
 * on `@prisma/client` directly (keeps it tree-shakeable for tests that mock
 * the registry without spinning up Prisma).
 */
export interface MaintenanceStatePrismaLike {
  maintenanceState: {
    findUnique: (args: { where: { singletonKey: string } }) => Promise<{
      mode: string;
      phase: string | null;
      pendingUntil: Date | null;
      activatedAt: Date | null;
      reason: string | null;
      setByOpsUserId: string | null;
      setAt: Date;
      updatedAt: Date;
    } | null>;
    upsert: (args: {
      where: { singletonKey: string };
      create: {
        singletonKey: string;
        mode: string;
        phase: string | null;
        pendingUntil: Date | null;
        activatedAt: Date | null;
        reason: string | null;
        setByOpsUserId: string | null;
        setAt: Date;
      };
      update: {
        mode: string;
        phase: string | null;
        pendingUntil: Date | null;
        activatedAt: Date | null;
        reason: string | null;
        setByOpsUserId: string | null;
        setAt: Date;
      };
    }) => Promise<unknown>;
  };
}

/**
 * Minimal Redis surface needed by the maintenance state helpers. Typed as
 * `(...args: any[])` for `set` so the same interface is satisfied by both
 * `ioredis` (variadic `EX`/`PX` etc.) and `node-redis` (single options
 * object), without forcing every call site to pick a particular client.
 */
export interface MaintenanceStateRedisLike {
  get: (key: string) => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: string, value: string, ...args: any[]) => Promise<unknown>;
  del?: (key: string) => Promise<unknown>;
}

interface ProcessCache {
  value: MaintenanceStateRecord;
  storedAt: number;
}

const PROCESS_CACHE_TTL_MS = 5_000;
let processCache: ProcessCache | null = null;

function isMode(value: unknown): value is LoadShedModeWithMaintenance {
  return typeof value === 'string' && (LOAD_SHED_MODES as readonly string[]).includes(value);
}

function isPhase(value: unknown): value is MaintenancePhase {
  return typeof value === 'string' && (MAINTENANCE_PHASES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates/normalizes a raw object into a `MaintenanceStateRecord`. Returns
 * `null` if the input is malformed (caller falls back to DB or defaults).
 */
export function parseMaintenanceStateRecord(input: unknown): MaintenanceStateRecord | null {
  if (!isPlainObject(input)) return null;
  if (!isMode(input.mode)) return null;
  const phase = input.phase === null || input.phase === undefined ? null : isPhase(input.phase) ? input.phase : null;
  const stringOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : v === null ? null : null);
  const requiredIso = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const setAt = requiredIso(input.setAt);
  const updatedAt = requiredIso(input.updatedAt);
  if (!setAt || !updatedAt) return null;
  return {
    mode: input.mode,
    phase,
    pendingUntil: stringOrNull(input.pendingUntil),
    activatedAt: stringOrNull(input.activatedAt),
    reason: stringOrNull(input.reason),
    setByOpsUserId: stringOrNull(input.setByOpsUserId),
    setAt,
    updatedAt
  };
}

function rowToRecord(row: {
  mode: string;
  phase: string | null;
  pendingUntil: Date | null;
  activatedAt: Date | null;
  reason: string | null;
  setByOpsUserId: string | null;
  setAt: Date;
  updatedAt: Date;
}): MaintenanceStateRecord {
  return {
    mode: isMode(row.mode) ? row.mode : 'normal',
    phase: row.phase && isPhase(row.phase) ? row.phase : null,
    pendingUntil: row.pendingUntil ? row.pendingUntil.toISOString() : null,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    reason: row.reason,
    setByOpsUserId: row.setByOpsUserId,
    setAt: row.setAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function readCache(redis: MaintenanceStateRedisLike | null): Promise<MaintenanceStateRecord | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(MAINTENANCE_STATE_REDIS_KEY);
    if (!raw) return null;
    return parseMaintenanceStateRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(redis: MaintenanceStateRedisLike | null, record: MaintenanceStateRecord): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(MAINTENANCE_STATE_REDIS_KEY, JSON.stringify(record));
  } catch {
    // Redis is a soft cache; failures must not break the write — Postgres
    // is already updated by the time we get here.
  }
}

/**
 * Force the in-process memo to be discarded on the next read. Used after
 * tests, after explicit writes from the same process, and in worker boot
 * paths to ensure the next guard read sees the fresh DB value.
 */
export function invalidateMaintenanceProcessCache(): void {
  processCache = null;
}

/**
 * Returns the same record with `phase` promoted to `active` if the state is
 * a stuck `pending` past its grace window. Pure / no side effects — callers
 * decide whether to persist the change. Exposed for tests and the read path.
 */
export function maybePromoteOverduePending(
  record: MaintenanceStateRecord,
  nowMs: number,
  graceMs: number = DEFAULT_MAINTENANCE_ACTIVATION_GRACE_MS
): MaintenanceStateRecord {
  if (record.mode !== 'maintenance') return record;
  if (record.phase !== 'pending') return record;
  if (!record.pendingUntil) return record;
  const pendingUntilMs = Date.parse(record.pendingUntil);
  if (!Number.isFinite(pendingUntilMs)) return record;
  if (nowMs < pendingUntilMs + graceMs) return record;
  const promotedAtIso = new Date(nowMs).toISOString();
  return {
    ...record,
    phase: 'active',
    activatedAt: record.activatedAt ?? promotedAtIso,
    setAt: promotedAtIso,
    updatedAt: promotedAtIso
  };
}

/**
 * Reads the durable state. Resolution order:
 *   1. In-process memo (5s TTL) — keeps load-shed guard's hot path off the
 *      network in steady state.
 *   2. Redis cache (single JSON blob).
 *   3. Postgres `MaintenanceState` singleton row. On miss the default
 *      'normal' state is returned without writing to DB (avoids creating
 *      rows from health-check probes).
 *
 * After resolving the record from cache/DB, applies a self-heal that
 * promotes a stuck `pending` state to `active` once
 * `pendingUntil + DEFAULT_MAINTENANCE_ACTIVATION_GRACE_MS` has elapsed. The
 * promoted record is persisted back to Redis (and to Postgres when a
 * client is available) so subsequent readers across the cluster see the
 * same active state without each having to re-evaluate the grace window.
 */
export async function readMaintenanceState(opts: {
  prisma: MaintenanceStatePrismaLike;
  redis: MaintenanceStateRedisLike | null;
  now?: () => number;
  activationGraceMs?: number;
}): Promise<MaintenanceStateRecord> {
  const now = opts.now ? opts.now() : Date.now();
  const graceMs = opts.activationGraceMs ?? resolveMaintenanceActivationGraceMs();
  if (processCache && now - processCache.storedAt < PROCESS_CACHE_TTL_MS) {
    // Still apply self-heal to the memoized record — the memo can be stale
    // across the grace boundary if the operator set pending right before
    // the cache landed. Pure check, no side effects on the fast path.
    const healed = maybePromoteOverduePending(processCache.value, now, graceMs);
    if (healed !== processCache.value) {
      processCache = { value: healed, storedAt: now };
      // Fire-and-forget persist so other replicas converge. We do NOT await
      // here to keep the hot path read-only.
      void (async () => {
        try {
          await writeMaintenanceState({
            prisma: opts.prisma,
            redis: opts.redis,
            record: {
              mode: healed.mode,
              phase: healed.phase,
              pendingUntil: healed.pendingUntil,
              activatedAt: healed.activatedAt,
              reason: healed.reason,
              setByOpsUserId: healed.setByOpsUserId,
              setAt: healed.setAt
            },
            now: () => now
          });
        } catch {
          // Best-effort persistence — see comment on the cache-hit branch.
        }
      })();
      return healed;
    }
    return processCache.value;
  }

  const fromCache = await readCache(opts.redis);
  if (fromCache) {
    const healed = maybePromoteOverduePending(fromCache, now, graceMs);
    if (healed !== fromCache) {
      // Persist the promotion so other replicas (and the Nginx gate) pick
      // up `active` on their next read instead of each one independently
      // re-deriving the same fallback. Best-effort: DB or Redis failure
      // should not crash the guard.
      try {
        await writeMaintenanceState({
          prisma: opts.prisma,
          redis: opts.redis,
          record: {
            mode: healed.mode,
            phase: healed.phase,
            pendingUntil: healed.pendingUntil,
            activatedAt: healed.activatedAt,
            reason: healed.reason,
            setByOpsUserId: healed.setByOpsUserId,
            setAt: healed.setAt
          },
          now: () => now
        });
      } catch {
        // Soft fail — the in-process memo + cache write below still ensures
        // this process serves `active` for the remainder of the TTL.
        await writeCache(opts.redis, healed);
      }
      processCache = { value: healed, storedAt: now };
      return healed;
    }
    processCache = { value: fromCache, storedAt: now };
    return fromCache;
  }

  let fromDb: MaintenanceStateRecord = DEFAULT_STATE;
  try {
    const row = await opts.prisma.maintenanceState.findUnique({
      where: { singletonKey: MAINTENANCE_STATE_SINGLETON_KEY }
    });
    if (row) {
      fromDb = rowToRecord(row);
    }
  } catch {
    // Treat DB read failure as "no row" — fall back to defaults so the guard
    // never crashes the request. The next successful read will repopulate.
    fromDb = DEFAULT_STATE;
  }

  const healed = maybePromoteOverduePending(fromDb, now, graceMs);
  if (healed !== fromDb) {
    try {
      await writeMaintenanceState({
        prisma: opts.prisma,
        redis: opts.redis,
        record: {
          mode: healed.mode,
          phase: healed.phase,
          pendingUntil: healed.pendingUntil,
          activatedAt: healed.activatedAt,
          reason: healed.reason,
          setByOpsUserId: healed.setByOpsUserId,
          setAt: healed.setAt
        },
        now: () => now
      });
    } catch {
      await writeCache(opts.redis, healed);
    }
    processCache = { value: healed, storedAt: now };
    return healed;
  }

  await writeCache(opts.redis, fromDb);
  processCache = { value: fromDb, storedAt: now };
  return fromDb;
}

/**
 * Writes the state to Postgres first (source of truth), then refreshes the
 * Redis cache and in-process memo. Callers pass a fully-resolved
 * `MaintenanceStateRecord` describing the target state.
 */
export async function writeMaintenanceState(opts: {
  prisma: MaintenanceStatePrismaLike;
  redis: MaintenanceStateRedisLike | null;
  record: Omit<MaintenanceStateRecord, 'updatedAt'> & { updatedAt?: string };
  now?: () => number;
}): Promise<MaintenanceStateRecord> {
  const nowMs = opts.now ? opts.now() : Date.now();
  const setAtIso = opts.record.setAt ?? new Date(nowMs).toISOString();
  const updatedAtIso = opts.record.updatedAt ?? new Date(nowMs).toISOString();
  const dataForDb = {
    singletonKey: MAINTENANCE_STATE_SINGLETON_KEY,
    mode: opts.record.mode,
    phase: opts.record.phase,
    pendingUntil: opts.record.pendingUntil ? new Date(opts.record.pendingUntil) : null,
    activatedAt: opts.record.activatedAt ? new Date(opts.record.activatedAt) : null,
    reason: opts.record.reason,
    setByOpsUserId: opts.record.setByOpsUserId,
    setAt: new Date(setAtIso)
  };

  await opts.prisma.maintenanceState.upsert({
    where: { singletonKey: MAINTENANCE_STATE_SINGLETON_KEY },
    create: dataForDb,
    update: {
      mode: dataForDb.mode,
      phase: dataForDb.phase,
      pendingUntil: dataForDb.pendingUntil,
      activatedAt: dataForDb.activatedAt,
      reason: dataForDb.reason,
      setByOpsUserId: dataForDb.setByOpsUserId,
      setAt: dataForDb.setAt
    }
  });

  const record: MaintenanceStateRecord = {
    mode: opts.record.mode,
    phase: opts.record.phase,
    pendingUntil: opts.record.pendingUntil,
    activatedAt: opts.record.activatedAt,
    reason: opts.record.reason,
    setByOpsUserId: opts.record.setByOpsUserId,
    setAt: setAtIso,
    updatedAt: updatedAtIso
  };

  await writeCache(opts.redis, record);
  processCache = { value: record, storedAt: nowMs };
  return record;
}

/**
 * Reads state via a `FastifyRequest` (Fastify exposes `prisma` and `redis`
 * decorators on the server instance). Convenience wrapper for the hot path
 * in `loadShedGuard`/`/maintenance/status`.
 */
export async function readMaintenanceStateFromRequest(
  request: FastifyRequest
): Promise<MaintenanceStateRecord> {
  const prisma = (request.server as unknown as { prisma?: MaintenanceStatePrismaLike }).prisma;
  const redis = (request.server as unknown as { redis?: MaintenanceStateRedisLike }).redis ?? null;
  if (!prisma) {
    // Without Prisma we cannot consult the durable source — fall back to
    // Redis-only read. This only happens in misconfigured test harnesses.
    const fromCache = await readCache(redis);
    return fromCache ?? DEFAULT_STATE;
  }
  return readMaintenanceState({ prisma, redis });
}

/**
 * Returns true when the current state indicates Nginx should serve the
 * maintenance page for non-ops routes. Active phase only — pending phase
 * still serves storefront with a warning banner.
 */
export function isMaintenanceActive(state: MaintenanceStateRecord): boolean {
  return state.mode === 'maintenance' && state.phase === 'active';
}

/**
 * Returns true when the storefront should display the warning banner. Both
 * 'pending' and 'active' phases qualify — the banner countdowns to active
 * during pending, then morphs into a "we'll be back shortly" message if it
 * is somehow rendered during active (defence in depth — Nginx blocks active
 * traffic from reaching the frontend SSR anyway).
 */
export function isMaintenancePendingOrActive(state: MaintenanceStateRecord): boolean {
  return state.mode === 'maintenance' && (state.phase === 'pending' || state.phase === 'active');
}
