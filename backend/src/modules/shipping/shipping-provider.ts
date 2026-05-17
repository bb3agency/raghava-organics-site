import { ShippingProviderAdapter } from '@common/interfaces/shipping-provider.interface';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import DelhiveryAdapter from './adapters/delhivery.adapter';
import ShiprocketAdapter from './adapters/shiprocket.adapter';
import { NoopShippingAdapter } from './adapters/noop-shipping.adapter';

export type ShippingProviderRuntime = {
  provider: 'delhivery' | 'shiprocket' | 'noop';
  failoverEnabled: boolean;
  capabilities: {
    supportsCreateShipment: boolean;
    supportsTracking: boolean;
    supportsRateCalculation: boolean;
    supportsSchedulePickup: boolean;
    supportsGenerateLabel: boolean;
  };
  adapter: ShippingProviderAdapter | null;
};

function parseBooleanFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

class CircuitBreakerShippingAdapter implements ShippingProviderAdapter {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly delegate: ShippingProviderAdapter,
    private readonly failureThreshold = Number(process.env.SHIPPING_CB_FAILURE_THRESHOLD ?? 5),
    private readonly cooldownMs = Number(process.env.SHIPPING_CB_COOLDOWN_MS ?? 30_000)
  ) {}

  private assertClosed(): void {
    if (Date.now() < this.openUntil) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shipping provider temporarily unavailable', 503);
    }
  }

  private recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures = 0;
    }
  }

  async createShipment(input: Parameters<ShippingProviderAdapter['createShipment']>[0]) {
    this.assertClosed();
    try {
      const result = await this.delegate.createShipment(input);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async trackShipment(awbNumber: string) {
    this.assertClosed();
    try {
      const result = await this.delegate.trackShipment(awbNumber);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async cancelShipment(awbNumber: string) {
    this.assertClosed();
    try {
      const result = await this.delegate.cancelShipment(awbNumber);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async checkServiceability(pincode: string) {
    this.assertClosed();
    try {
      const result = await this.delegate.checkServiceability(pincode);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async calculateDeliveryRate(input: Parameters<ShippingProviderAdapter['calculateDeliveryRate']>[0]) {
    this.assertClosed();
    try {
      const result = await this.delegate.calculateDeliveryRate(input);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async schedulePickup(shiprocketShipmentId: string) {
    if (!this.delegate.schedulePickup) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'schedulePickup not supported by this shipping provider', 501);
    }
    this.assertClosed();
    try {
      const result = await this.delegate.schedulePickup(shiprocketShipmentId);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async generateLabel(shiprocketShipmentId: string) {
    if (!this.delegate.generateLabel) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'generateLabel not supported by this shipping provider', 501);
    }
    this.assertClosed();
    try {
      const result = await this.delegate.generateLabel(shiprocketShipmentId);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}

export function resolveShippingProviderRuntime(runtimeConfig: NodeJS.ProcessEnv = process.env): ShippingProviderRuntime {
  const primary = (runtimeConfig.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase();
  const failoverEnabled = parseBooleanFlag(runtimeConfig.SHIPPING_PROVIDER_FAILOVER_ENABLED);

  if (primary === 'noop') {
    return {
      provider: 'noop',
      failoverEnabled,
      capabilities: {
        supportsCreateShipment: false,
        supportsTracking: false,
        supportsRateCalculation: false,
        supportsSchedulePickup: false,
        supportsGenerateLabel: false
      },
      adapter: new NoopShippingAdapter()
    };
  }

  if (primary === 'shiprocket') {
    const email = runtimeConfig.SHIPROCKET_EMAIL?.trim();
    const password = runtimeConfig.SHIPROCKET_PASSWORD?.trim();
    if (!email || !password) {
      return {
        provider: 'shiprocket',
        failoverEnabled,
        capabilities: {
          supportsCreateShipment: false,
          supportsTracking: false,
          supportsRateCalculation: false,
          supportsSchedulePickup: false,
          supportsGenerateLabel: false
        },
        adapter: null
      };
    }
    const baseUrl = runtimeConfig.SHIPROCKET_BASE_URL?.trim();
    const adapter = baseUrl
      ? new ShiprocketAdapter({ email, password, baseUrl })
      : new ShiprocketAdapter({ email, password });
    return {
      provider: 'shiprocket',
      failoverEnabled,
      capabilities: {
        supportsCreateShipment: true,
        supportsTracking: true,
        supportsRateCalculation: true,
        supportsSchedulePickup: true,
        supportsGenerateLabel: true
      },
      adapter
    };
  }

  if (primary !== 'delhivery') {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Unsupported SHIPPING_PROVIDER: ${primary}`, 500);
  }

  const apiKey = runtimeConfig.DELHIVERY_API_KEY;
  if (!apiKey) {
    return {
      provider: 'delhivery',
      failoverEnabled,
      capabilities: {
        supportsCreateShipment: false,
        supportsTracking: false,
        supportsRateCalculation: false,
        supportsSchedulePickup: false,
        supportsGenerateLabel: false
      },
      adapter: null
    };
  }

  const baseUrl = runtimeConfig.DELHIVERY_BASE_URL;
  const adapter = baseUrl ? new DelhiveryAdapter({ apiKey, baseUrl }) : new DelhiveryAdapter({ apiKey });
  return {
    provider: 'delhivery',
    failoverEnabled,
    capabilities: {
      supportsCreateShipment: true,
      supportsTracking: true,
      supportsRateCalculation: true,
      supportsSchedulePickup: false,
      supportsGenerateLabel: false
    },
    adapter
  };
}

export function createShippingProvider(runtimeConfig: NodeJS.ProcessEnv = process.env): ShippingProviderAdapter | null {
  const runtime = resolveShippingProviderRuntime(runtimeConfig);
  if (!runtime.adapter) {
    return null;
  }
  return new CircuitBreakerShippingAdapter(runtime.adapter);
}
