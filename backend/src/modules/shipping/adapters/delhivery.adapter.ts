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
import { resolveShippingHsnCode } from '@common/shipping/resolve-shipping-hsn';

type DelhiveryAdapterOptions = {
  apiKey: string;
  /**
   * Base URL without trailing slash. Defaults to production.
   * Use https://staging-express.delhivery.com for staging.
   */
  baseUrl?: string;
  /**
   * Registered warehouse/pickup name in Delhivery dashboard.
   * Must exactly match the pickup location name set up in your Delhivery account.
   * Required for createShipment to succeed.
   */
  pickupLocationName?: string;
  /** Origin pincode — used as return_pin fallback. Normally from input.originPincode. */
  pickupPincode?: string;
  /** Seller/return address city */
  sellerCity?: string;
  /** Seller/return address state */
  sellerState?: string;
  /** Seller name (used for seller_name and return_name) */
  sellerName?: string;
  /** Seller address line (used for seller_add and return_add) */
  sellerAddress?: string;
  /** Seller phone (used for return_phone) */
  sellerPhone?: string;
};

export default class DelhiveryAdapter implements ShippingProviderAdapter {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly pickupLocationName: string;

  private readonly pickupPincode: string;

  private readonly sellerCity: string;

  private readonly sellerState: string;

  private readonly sellerName: string;

  private readonly sellerAddress: string;

  private readonly sellerPhone: string;

  constructor(options: DelhiveryAdapterOptions) {
    this.apiKey = options.apiKey;
    // Base URL must NOT include /api suffix — all paths include /api/ where needed
    this.baseUrl = (options.baseUrl ?? 'https://track.delhivery.com').replace(/\/$/, '');
    this.pickupLocationName = options.pickupLocationName ?? 'Primary';
    this.pickupPincode = options.pickupPincode ?? '';
    this.sellerCity = options.sellerCity ?? '';
    this.sellerState = options.sellerState ?? '';
    this.sellerName = options.sellerName ?? 'Store';
    this.sellerAddress = options.sellerAddress ?? '';
    this.sellerPhone = options.sellerPhone ?? '';
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const weightKg = Number((input.totalWeightGrams / 1000).toFixed(3));
    const isCod = input.paymentMode === 'COD';
    const returnPin = this.pickupPincode || input.originPincode;
    const productsDesc =
      input.items && input.items.length > 0
        ? input.items.map((i) => i.name).join(', ').slice(0, 255)
        : 'Product';
    const totalQty =
      input.items && input.items.length > 0 ? input.items.reduce((s, i) => s + i.quantity, 0) : 1;
    const orderDate = new Date().toISOString().slice(0, 10);

    const shipmentEntry: Record<string, unknown> = {
      name: input.customer.fullName,
      phone: input.customer.phone,
      add: input.customer.line2
        ? `${input.customer.line1}, ${input.customer.line2}`
        : input.customer.line1,
      city: input.customer.city,
      state: input.customer.state,
      country: 'India',
      pin: input.destinationPincode,
      order: input.orderNumber,
      waybill: '', // leave empty for auto-assignment
      payment_mode: input.paymentMode, // 'COD' | 'Prepaid'
      total_amount: Number(input.amountRupees.toFixed(2)),
      products_desc: productsDesc,
      hsn_code: resolveShippingHsnCode({ variantHsnCode: input.hsnCode }),
      order_date: orderDate,
      quantity: String(totalQty),
      weight: weightKg,
      origin_pin: input.originPincode,
      seller_gst_tin: input.sellerGstTin,
      seller_name: this.sellerName,
      seller_add: this.sellerAddress || input.originPincode,
      seller_phone: this.sellerPhone,
      return_name: this.sellerName,
      return_add: this.sellerAddress || input.originPincode,
      return_pin: returnPin,
      return_city: this.sellerCity,
      return_state: this.sellerState,
      return_country: 'India',
      return_phone: this.sellerPhone
    };

    if (isCod) {
      shipmentEntry.cod_amount = Number(input.amountRupees.toFixed(2));
    }

    if (input.dimensions) {
      shipmentEntry.shipment_length = input.dimensions.lengthCm;
      shipmentEntry.shipment_breadth = input.dimensions.breadthCm;
      shipmentEntry.shipment_height = input.dimensions.heightCm;
    }

    const data = JSON.stringify({
      pickup_location: { name: this.pickupLocationName },
      shipments: [shipmentEntry]
    });

    const body = new URLSearchParams({ format: 'json', data });

    const payload = await this.request('/api/cmu/create.json', { method: 'POST', body });

    const packageWaybill = this.pickString(payload, [
      ['packages', 0, 'waybill'],
      ['shipment', 'waybill'],
      ['waybill']
    ]);

    if (!packageWaybill) {
      const remarks = this.pickString(payload, [['packages', 0, 'remarks'], ['rmk']]);
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        `Unable to extract AWB from Delhivery response${remarks ? `: ${remarks}` : ''}`,
        502
      );
    }

    return {
      awbNumber: packageWaybill,
      trackingUrl: `https://www.delhivery.com/track/package/${packageWaybill}`,
      providerPayload: payload
    };
  }

  async trackShipment(awbNumber: string): Promise<TrackShipmentResult> {
    const payload = await this.request(
      `/api/v1/packages/json/?waybill=${encodeURIComponent(awbNumber)}&verbose=2`
    );

    const shipmentData = this.pickUnknown(payload, ['ShipmentData', 0, 'Shipment']);
    const status =
      this.pickString(payload, [['ShipmentData', 0, 'Shipment', 'Status', 'Status']]) ?? 'UNKNOWN';

    const events: TrackShipmentResult['events'] = [];

    if (shipmentData && typeof shipmentData === 'object' && !Array.isArray(shipmentData)) {
      const scans = (shipmentData as Record<string, unknown>).Scans;
      if (Array.isArray(scans)) {
        for (const entry of scans) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const detail = (entry as Record<string, unknown>).ScanDetail;
          if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
          const d = detail as Record<string, unknown>;

          const evtStatus =
            typeof d.StatusCode === 'string' ? d.StatusCode :
            typeof d.ScanType === 'string' ? d.ScanType : 'UNKNOWN';
          const evtDescription =
            typeof d.Scan === 'string' ? d.Scan :
            typeof d.Instructions === 'string' && d.Instructions ? d.Instructions : evtStatus;
          const evtLocation = typeof d.ScannedLocation === 'string' ? d.ScannedLocation : undefined;
          const evtOccurredRaw =
            typeof d.StatusDateTime === 'string' ? d.StatusDateTime :
            typeof d.ScanDateTime === 'string' ? d.ScanDateTime : '';
          const evtOccurredAt = evtOccurredRaw
            ? new Date(evtOccurredRaw).toISOString()
            : new Date().toISOString();

          events.push({
            status: evtStatus,
            description: evtDescription,
            ...(evtLocation ? { location: evtLocation } : {}),
            occurredAt: evtOccurredAt
          });
        }
      }
    }

    return { status, events, providerPayload: payload };
  }

  async cancelShipment(awbNumber: string): Promise<{ cancelled: boolean; providerPayload: Record<string, unknown> }> {
    const data = JSON.stringify({ waybill: awbNumber, cancellation: true });
    const body = new URLSearchParams({ format: 'json', data });

    const payload = await this.request('/api/p/edit/', { method: 'POST', body });

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
    return { cancelled: true, providerPayload: payload };
  }

  async checkServiceability(pincode: string, _originPincode?: string): Promise<ServiceabilityResult> {
    // Pincode endpoint is at /c/api/pin-codes (NOT under /api)
    const payload = await this.request(
      `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`
    );
    const serviceable = this.pickArrayLength(payload, [['delivery_codes']]) > 0;
    return { pincode, serviceable, providerPayload: payload };
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

    // Note: Delhivery's rate endpoint uses /api/kinko (not under /api prefix that would double)
    const payload = await this.request(`/api/kinko/v1/invoice/charges/.json?${query.toString()}`);

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

    const shippingChargePaise =
      chargeRupees !== null ? Math.max(0, Math.round(chargeRupees * 100)) : 0;
    const estimatedDays =
      estimatedDaysRaw !== null ? this.normalizeEstimatedDays(estimatedDaysRaw) : 4;

    return { shippingChargePaise, estimatedDays, providerPayload: payload };
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
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        `Delhivery API request failed: ${response.status}`,
        502
      );
    }
    return parsed;
  }

  private parsePayload(text: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(text);
      // Delhivery sometimes returns an array at top level — wrap it
      if (Array.isArray(parsed)) {
        return { _array: parsed };
      }
      return parsed as Record<string, unknown>;
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
    if (integerDays < 1) return 1;
    if (integerDays > 30) return 30;
    return integerDays;
  }
}
