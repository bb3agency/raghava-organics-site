import { afterEach, describe, expect, it, vi } from 'vitest';

describe('validateRuntimeEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('allows boot when provider selectors are set without full dependency keys (incremental Ops save)', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-secret-value-32chars-minimum-xx',
      JWT_REFRESH_SECRET: 'jwt-refresh-secret-value-32chars-min',
      OPS_DB_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/raghava_organics',
      REDIS_URL: 'redis://:password@127.0.0.1:6379',
      PAYMENT_PROVIDER: 'razorpay',
      SHIPPING_PROVIDER: 'shiprocket',
      NOTIFY_EMAIL_ENABLED: 'true',
    };

    const { validateRuntimeEnv } = await import('./app.config');
    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it('still rejects unsupported PAYMENT_PROVIDER at boot', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-secret-value-32chars-minimum-xx',
      JWT_REFRESH_SECRET: 'jwt-refresh-secret-value-32chars-min',
      OPS_DB_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/raghava_organics',
      REDIS_URL: 'redis://:password@127.0.0.1:6379',
      PAYMENT_PROVIDER: 'stripe',
    };

    const { validateRuntimeEnv } = await import('./app.config');
    expect(() => validateRuntimeEnv()).toThrow(/Unsupported PAYMENT_PROVIDER/);
  });
});
