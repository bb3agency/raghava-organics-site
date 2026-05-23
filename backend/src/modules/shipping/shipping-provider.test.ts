import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveShippingProviderRuntime } from './shipping-provider';

describe('shipping provider runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns unconfigured adapter when delhivery key is missing', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'delhivery');
    vi.stubEnv('DELHIVERY_API_KEY', '');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('unconfigured');
    expect(runtime.adapter).not.toBeNull();
    expect(runtime.capabilities.supportsCreateShipment).toBe(false);
  });

  it('supports noop shipping provider selection', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'noop');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('noop');
    expect(runtime.adapter).not.toBeNull();
    expect(runtime.capabilities.supportsTracking).toBe(false);
  });

  it('returns unconfigured adapter when shiprocket credentials are missing', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'shiprocket');
    vi.stubEnv('SHIPROCKET_EMAIL', '');
    vi.stubEnv('SHIPROCKET_PASSWORD', '');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('unconfigured');
    expect(runtime.adapter).not.toBeNull();
    expect(runtime.capabilities.supportsCreateShipment).toBe(false);
  });

  it('creates shiprocket adapter when credentials are present', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'shiprocket');
    vi.stubEnv('SHIPROCKET_EMAIL', 'test@example.com');
    vi.stubEnv('SHIPROCKET_PASSWORD', 'secret123');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('shiprocket');
    expect(runtime.adapter).not.toBeNull();
    expect(runtime.capabilities.supportsCreateShipment).toBe(true);
    expect(runtime.capabilities.supportsTracking).toBe(true);
    expect(runtime.capabilities.supportsRateCalculation).toBe(true);
    expect(runtime.capabilities.supportsSchedulePickup).toBe(true);
    expect(runtime.capabilities.supportsGenerateLabel).toBe(true);
  });

  it('returns unconfigured adapter for unknown SHIPPING_PROVIDER value', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'unknown-courier');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('unconfigured');
    expect(runtime.adapter).not.toBeNull();
  });

  it('returns unconfigured adapter when SHIPPING_PROVIDER is missing', () => {
    vi.stubEnv('SHIPPING_PROVIDER', '');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.provider).toBe('noop');
    expect(runtime.adapter).not.toBeNull();
  });

  it('delhivery adapter has supportsSchedulePickup=false', () => {
    vi.stubEnv('SHIPPING_PROVIDER', 'delhivery');
    vi.stubEnv('DELHIVERY_API_KEY', 'test-key');
    const runtime = resolveShippingProviderRuntime();
    expect(runtime.capabilities.supportsSchedulePickup).toBe(false);
    expect(runtime.capabilities.supportsGenerateLabel).toBe(false);
  });
});
