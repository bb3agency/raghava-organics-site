import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@common/errors/app-error';
import { getLoadShedMode, loadShedGuard, setLoadShedMode } from './load-shed.guard';

type MockRequest = {
  method: string;
  url: string;
  routeOptions: { url: string };
  server: {
    redis: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
  };
};

function buildRequest(route: string, method = 'GET', modeFromRedis: string | null = 'normal'): MockRequest {
  return {
    method,
    url: route,
    routeOptions: { url: route },
    server: {
      redis: {
        get: vi.fn(async () => modeFromRedis),
        set: vi.fn(async () => 'OK')
      }
    }
  };
}

describe('load shed guard', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    const request = buildRequest('/api/v1/health');
    await setLoadShedMode(request as never, 'normal');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('allows always-allowed routes in emergency mode', async () => {
    vi.stubEnv('LOAD_SHED_MODE', 'emergency');
    const request = buildRequest('/api/v1/health');

    await expect(loadShedGuard(request as never, {} as never)).resolves.toBeUndefined();
  });

  it('blocks non-critical admin routes in reduced mode', async () => {
    vi.stubEnv('LOAD_SHED_MODE', 'reduced');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6000);
    const request = buildRequest('/api/v1/admin/dashboard/kpis');

    await expect(loadShedGuard(request as never, {} as never)).rejects.toBeInstanceOf(AppError);
  });

  it('blocks checkout mutations in emergency mode', async () => {
    vi.stubEnv('LOAD_SHED_MODE', 'emergency');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6000);
    const request = buildRequest('/api/v1/orders', 'POST');

    await expect(loadShedGuard(request as never, {} as never)).rejects.toBeInstanceOf(AppError);
  });

  it('reads and updates load shed mode via helpers', async () => {
    const request = buildRequest('/api/v1/admin/orders', 'GET', 'reduced');

    await setLoadShedMode(request as never, 'reduced');
    const mode = await getLoadShedMode(request as never);

    expect(mode).toBe('reduced');
    expect(request.server.redis.set).toHaveBeenCalledWith('ops:load_shed:mode', 'reduced');
  });
});
