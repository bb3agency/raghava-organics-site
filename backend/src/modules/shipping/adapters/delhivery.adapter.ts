import {
  type CreateShipmentInput,
  type CreateShipmentResult,
  type DeliveryRateInput,
  type DeliveryRateResult,
  type ServiceabilityResult,
  type ShippingProviderAdapter,
  type TrackShipmentResult
} from '@common/interfaces/shipping-provider.interface';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';

type DelhiveryAdapterOptions = {
  apiKey: string;
  baseUrl?: string;
};

export default class DelhiveryAdapter implements ShippingProviderAdapter {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  constructor(options: DelhiveryAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://track.delhivery.com/api';
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const body = new FormData();
    body.append('format', 'json');
    body.append(
      'data',
      JSON.stringify({
        shipments: [
          {
            name: input.customer.fullName,
            phone: input.customer.phone,
            add: input.customer.line2 ? `${input.customer.line1}, ${input.customer.line2}` : input.customer.line1,
            city: input.customer.city,
            state: input.customer.state,
            country: 'India',
            pin: input.destinationPincode,
            order: input.orderNumber,
            waybill: input.orderNumber,
            payment_mode: input.paymentMode,
            total_amount: Number(input.amountRupees.toFixed(2)),
            weight: input.totalWeightGrams,
            origin_pin: input.originPincode,
            seller_gst_tin: input.sellerGstTin,
            hsn_code: input.hsnCode
          }
        ]
      })
    );

    const payload = await this.request('/cmu/create.json', { method: 'POST', body });

    const packageWaybill = this.pickString(payload, [
      ['packages', 0, 'waybill'],
      ['shipment', 'waybill'],
      ['waybill']
    ]);

    if (!packageWaybill) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Unable to extract AWB from Delhivery response', 502);
    }

    return {
      awbNumber: packageWaybill,
      trackingUrl: `https://www.delhivery.com/track/package/${packageWaybill}`,
      providerPayload: payload
    };
  }

  async trackShipment(awbNumber: string): Promise<TrackShipmentResult> {
    const payload = await this.request(`/v1/packages/json/?waybill=${encodeURIComponent(awbNumber)}`);
    const status = this.pickString(payload, [['ShipmentData', 0, 'Shipment', 'Status', 'Status']]) ?? 'UNKNOWN';

    return {
      status,
      events: [],
      providerPayload: payload
    };
  }

  async cancelShipment(awbNumber: string): Promise<{ cancelled: boolean; providerPayload: Record<string, unknown> }> {
    const payload = await this.request('/api/p/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        waybill: awbNumber,
        cancellation: 'true'
      })
    });
    const statusText = (
      this.pickString(payload, [['status'], ['remark'], ['message']]) ?? ''
    ).toLowerCase();
    const cancelled =
      statusText.includes('cancel') ||
      statusText.includes('success') ||
      this.pickString(payload, [['waybill']]) === awbNumber;
    if (!cancelled) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        `Delhivery did not confirm cancellation for AWB ${awbNumber}`,
        502
      );
    }
    return {
      cancelled: true,
      providerPayload: payload
    };
  }

  async checkServiceability(pincode: string, _originPincode?: string): Promise<ServiceabilityResult> {
    const payload = await this.request(`/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`);
    const serviceable = this.pickArrayLength(payload, [['delivery_codes']]) > 0;
    return {
      pincode,
      serviceable,
      providerPayload: payload
    };
  }

  async calculateDeliveryRate(input: DeliveryRateInput): Promise<DeliveryRateResult> {
    const isCod = input.paymentMode === 'COD';
    const query = new URLSearchParams({
      md: 'S',
      ss: 'Delivered',
      d_pin: input.destinationPincode,
      o_pin: input.originPincode,
      cgm: String(Math.max(1, Math.floor(input.totalWeightGrams))),
      pt: isCod ? 'COD' : 'Pre-paid',
      cod: isCod ? '1' : '0'
    });

    const payload = await this.request(`/api/kinko/v1/invoice/charges/?${query.toString()}`);
    const chargeRupees = this.pickNumber(payload, [
      ['total_amount'],
      ['totalAmount'],
      ['freight_charge'],
      ['charges', 'total_amount'],
      ['charges', 0, 'total_amount'],
      ['data', 'total_amount'],
      ['data', 0, 'total_amount']
    ]);

    const estimatedDaysRaw = this.pickNumber(payload, [
      ['estimated_delivery_days'],
      ['estimatedDays'],
      ['tat_days'],
      ['delivery_days'],
      ['data', 'estimated_delivery_days'],
      ['data', 0, 'estimated_delivery_days']
    ]);

    const shippingChargePaise = chargeRupees !== null ? Math.max(0, Math.round(chargeRupees * 100)) : 0;
    const estimatedDays = estimatedDaysRaw !== null ? this.normalizeEstimatedDays(estimatedDaysRaw) : 4;

    return {
      shippingChargePaise,
      estimatedDays,
      providerPayload: payload
    };
  }

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${this.apiKey}`,
        ...(init?.headers ?? {})
      },
      signal: AbortSignal.timeout(10_000)
    });

    const responseText = await response.text();
    const parsed = this.parsePayload(responseText);
    if (!response.ok) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Delhivery API request failed: ${response.status}`, 502);
    }

    return parsed;
  }

  private parsePayload(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Delhivery returned invalid JSON', 502);
    }
  }

  private pickString(payload: Record<string, unknown>, paths: Array<Array<string | number>>): string | null {
    for (const path of paths) {
      let cursor: unknown = payload;
      for (const key of path) {
        if (typeof key === 'number') {
          if (!Array.isArray(cursor) || key >= cursor.length) {
            cursor = undefined;
            break;
          }
          cursor = cursor[key];
          continue;
        }

        if (!cursor || typeof cursor !== 'object' || !(key in cursor)) {
          cursor = undefined;
          break;
        }
        cursor = (cursor as Record<string, unknown>)[key];
      }

      if (typeof cursor === 'string' && cursor.length > 0) {
        return cursor;
      }
    }

    return null;
  }

  private pickArrayLength(payload: Record<string, unknown>, paths: Array<Array<string | number>>): number {
    for (const path of paths) {
      const value = this.pickUnknown(payload, path);
      if (Array.isArray(value)) {
        return value.length;
      }
    }
    return 0;
  }

  private pickNumber(payload: Record<string, unknown>, paths: Array<Array<string | number>>): number | null {
    for (const path of paths) {
      const value = this.pickUnknown(payload, path);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private pickUnknown(payload: Record<string, unknown>, path: Array<string | number>): unknown {
    let cursor: unknown = payload;
    for (const key of path) {
      if (typeof key === 'number') {
        if (!Array.isArray(cursor) || key >= cursor.length) {
          return undefined;
        }
        cursor = cursor[key];
        continue;
      }

      if (!cursor || typeof cursor !== 'object' || !(key in cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
  }

  private normalizeEstimatedDays(value: number): number {
    const integerDays = Math.floor(value);
    if (integerDays < 1) {
      return 1;
    }
    if (integerDays > 30) {
      return 30;
    }
    return integerDays;
  }
}
