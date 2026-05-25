import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateMaintenanceProcessCache,
  isMaintenanceActive,
  isMaintenancePendingOrActive,
  MAINTENANCE_STATE_REDIS_KEY,
  MAINTENANCE_STATE_SINGLETON_KEY,
  parseMaintenanceStateRecord,
  readMaintenanceState,
  writeMaintenanceState,
  type MaintenanceStatePrismaLike,
  type MaintenanceStateRecord,
  type MaintenanceStateRedisLike
} from './maintenance-state';

type Row = {
  mode: string;
  phase: string | null;
  pendingUntil: Date | null;
  activatedAt: Date | null;
  reason: string | null;
  setByOpsUserId: string | null;
  setAt: Date;
  updatedAt: Date;
} | null;

interface PrismaHarness {
  prisma: MaintenanceStatePrismaLike;
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  getRow: () => Row;
}

function buildPrisma(initialRow: Row): PrismaHarness {
  let row: Row = initialRow;
  const findUnique = vi.fn(async () => row);
  const upsert = vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
    const data = row ? args.update : args.create;
    row = {
      mode: (data.mode as string) ?? row?.mode ?? 'normal',
      phase: (data.phase as string | null) ?? null,
      pendingUntil: (data.pendingUntil as Date | null) ?? null,
      activatedAt: (data.activatedAt as Date | null) ?? null,
      reason: (data.reason as string | null) ?? null,
      setByOpsUserId: (data.setByOpsUserId as string | null) ?? null,
      setAt: (data.setAt as Date) ?? new Date(),
      updatedAt: new Date()
    };
    return row;
  });
  return {
    prisma: { maintenanceState: { findUnique, upsert } } as unknown as MaintenanceStatePrismaLike,
    findUnique,
    upsert,
    getRow: () => row
  };
}

interface RedisHarness {
  redis: MaintenanceStateRedisLike;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  getValue: () => string | null;
}

function buildRedis(initialValue: string | null = null): RedisHarness {
  let value = initialValue;
  const get = vi.fn(async (key: string) => (key === MAINTENANCE_STATE_REDIS_KEY ? value : null));
  const set = vi.fn(async (_key: string, v: string) => {
    value = v;
    return 'OK';
  });
  return {
    redis: { get, set } as unknown as MaintenanceStateRedisLike,
    get,
    set,
    getValue: () => value
  };
}

describe('maintenance-state helpers', () => {
  beforeEach(() => {
    invalidateMaintenanceProcessCache();
  });

  afterEach(() => {
    invalidateMaintenanceProcessCache();
    vi.restoreAllMocks();
  });

  it('returns default normal state when DB row is missing', async () => {
    const p = buildPrisma(null);
    const r = buildRedis(null);
    const state = await readMaintenanceState({ prisma: p.prisma, redis: r.redis });
    expect(state.mode).toBe('normal');
    expect(state.phase).toBeNull();
  });

  it('reads from DB when Redis cache is empty', async () => {
    const p = buildPrisma({
      mode: 'maintenance',
      phase: 'pending',
      pendingUntil: new Date('2030-01-01T00:00:00Z'),
      activatedAt: null,
      reason: 'planned',
      setByOpsUserId: 'ops-1',
      setAt: new Date('2030-01-01T00:00:00Z'),
      updatedAt: new Date('2030-01-01T00:00:00Z')
    });
    const r = buildRedis(null);
    const state = await readMaintenanceState({ prisma: p.prisma, redis: r.redis });
    expect(state.mode).toBe('maintenance');
    expect(state.phase).toBe('pending');
  });

  it('warms Redis cache on first read', async () => {
    const p = buildPrisma({
      mode: 'maintenance',
      phase: 'active',
      pendingUntil: null,
      activatedAt: new Date(),
      reason: null,
      setByOpsUserId: null,
      setAt: new Date(),
      updatedAt: new Date()
    });
    const r = buildRedis(null);
    await readMaintenanceState({ prisma: p.prisma, redis: r.redis });
    expect(r.set).toHaveBeenCalled();
    expect(r.getValue()).toContain('"mode":"maintenance"');
  });

  it('serves from Redis cache when present (DB never consulted)', async () => {
    const p = buildPrisma({
      mode: 'normal',
      phase: null,
      pendingUntil: null,
      activatedAt: null,
      reason: null,
      setByOpsUserId: null,
      setAt: new Date(),
      updatedAt: new Date()
    });
    const cachedRecord: MaintenanceStateRecord = {
      mode: 'maintenance',
      phase: 'active',
      pendingUntil: null,
      activatedAt: new Date().toISOString(),
      reason: null,
      setByOpsUserId: null,
      setAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const r = buildRedis(JSON.stringify(cachedRecord));
    const state = await readMaintenanceState({ prisma: p.prisma, redis: r.redis });
    expect(state.mode).toBe('maintenance');
    expect(state.phase).toBe('active');
    expect(p.findUnique).not.toHaveBeenCalled();
  });

  it('survives Redis loss by re-reading from DB (no exception)', async () => {
    const p = buildPrisma({
      mode: 'maintenance',
      phase: 'active',
      pendingUntil: null,
      activatedAt: new Date(),
      reason: 'persistent',
      setByOpsUserId: 'ops-2',
      setAt: new Date(),
      updatedAt: new Date()
    });
    const redis: MaintenanceStateRedisLike = {
      get: vi.fn(async () => { throw new Error('redis offline'); }),
      set: vi.fn(async () => { throw new Error('redis offline'); })
    };
    const state = await readMaintenanceState({ prisma: p.prisma, redis });
    expect(state.mode).toBe('maintenance');
    expect(state.phase).toBe('active');
  });

  it('writes Postgres + Redis on writeMaintenanceState', async () => {
    const p = buildPrisma(null);
    const r = buildRedis(null);
    await writeMaintenanceState({
      prisma: p.prisma,
      redis: r.redis,
      record: {
        mode: 'maintenance',
        phase: 'pending',
        pendingUntil: '2030-01-01T00:02:00Z',
        activatedAt: null,
        reason: 'planned downtime',
        setByOpsUserId: 'ops-3',
        setAt: '2030-01-01T00:00:00Z'
      }
    });
    expect(p.upsert).toHaveBeenCalledTimes(1);
    expect(r.getValue()).toContain('"mode":"maintenance"');
    expect(r.getValue()).toContain('"phase":"pending"');
  });

  it('clears phase/pendingUntil when exiting maintenance', async () => {
    const p = buildPrisma({
      mode: 'maintenance',
      phase: 'active',
      pendingUntil: new Date(),
      activatedAt: new Date(),
      reason: 'previous',
      setByOpsUserId: 'ops-1',
      setAt: new Date(),
      updatedAt: new Date()
    });
    const r = buildRedis(null);
    const record = await writeMaintenanceState({
      prisma: p.prisma,
      redis: r.redis,
      record: {
        mode: 'normal',
        phase: null,
        pendingUntil: null,
        activatedAt: null,
        reason: 'exit',
        setByOpsUserId: 'ops-1',
        setAt: new Date().toISOString()
      }
    });
    expect(record.mode).toBe('normal');
    expect(record.phase).toBeNull();
    expect(record.pendingUntil).toBeNull();
    expect(record.activatedAt).toBeNull();
  });

  describe('parseMaintenanceStateRecord', () => {
    it('returns null for non-object input', () => {
      expect(parseMaintenanceStateRecord(null)).toBeNull();
      expect(parseMaintenanceStateRecord('string')).toBeNull();
      expect(parseMaintenanceStateRecord(42)).toBeNull();
    });

    it('returns null for invalid mode', () => {
      expect(parseMaintenanceStateRecord({
        mode: 'bogus',
        phase: null,
        setAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })).toBeNull();
    });

    it('returns parsed record for valid input', () => {
      const result = parseMaintenanceStateRecord({
        mode: 'maintenance',
        phase: 'pending',
        pendingUntil: '2030-01-01T00:02:00Z',
        activatedAt: null,
        reason: 'planned',
        setByOpsUserId: 'ops-1',
        setAt: '2030-01-01T00:00:00Z',
        updatedAt: '2030-01-01T00:00:00Z'
      });
      expect(result).not.toBeNull();
      expect(result?.mode).toBe('maintenance');
      expect(result?.phase).toBe('pending');
    });

    it('normalizes unknown phase to null', () => {
      const result = parseMaintenanceStateRecord({
        mode: 'maintenance',
        phase: 'someothervalue',
        setAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      expect(result?.phase).toBeNull();
    });
  });

  describe('predicates', () => {
    const baseState: MaintenanceStateRecord = {
      mode: 'normal',
      phase: null,
      pendingUntil: null,
      activatedAt: null,
      reason: null,
      setByOpsUserId: null,
      setAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    it('isMaintenanceActive returns true only for maintenance + active', () => {
      expect(isMaintenanceActive(baseState)).toBe(false);
      expect(isMaintenanceActive({ ...baseState, mode: 'maintenance', phase: 'pending' })).toBe(false);
      expect(isMaintenanceActive({ ...baseState, mode: 'maintenance', phase: 'active' })).toBe(true);
    });

    it('isMaintenancePendingOrActive covers both phases', () => {
      expect(isMaintenancePendingOrActive(baseState)).toBe(false);
      expect(isMaintenancePendingOrActive({ ...baseState, mode: 'maintenance', phase: 'pending' })).toBe(true);
      expect(isMaintenancePendingOrActive({ ...baseState, mode: 'maintenance', phase: 'active' })).toBe(true);
    });
  });

  it('uses singleton key on every DB call', async () => {
    const p = buildPrisma(null);
    const r = buildRedis(null);
    await readMaintenanceState({ prisma: p.prisma, redis: r.redis });
    expect(p.findUnique).toHaveBeenCalledWith({
      where: { singletonKey: MAINTENANCE_STATE_SINGLETON_KEY }
    });
  });
});
