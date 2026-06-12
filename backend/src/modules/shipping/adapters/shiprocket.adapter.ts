import {
  type CreateShipmentInput,
  type CreateShipmentResult,
  type DeliveryRateInput,
  type DeliveryRateResult,
  type GenerateLabelResult,
  type SchedulePickupResult,
  type ServiceabilityResult,
  type ShippingProviderAdapter,
  type TrackShipmentResult
} from '@common/interfaces/shipping-provider.interface';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import {
  normalizeShippingHsn,
  resolveDefaultShippingHsn,
  resolveShippingHsnCode
} from '@common/shipping/resolve-shipping-hsn';
import {
  normalizeIndianShippingPhone,
  resolveShiprocketCustomerEmail
} from '@common/shipping/shiprocket-payload';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
const DEFAULT_PICKUP_LOCATION = 'Primary';
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // 9 days (buffer before 10d expiry)
const REQUEST_TIMEOUT_MS = 10_000; // 10s abort timeout on every fetch

type ShiprocketAdapterOptions = {
  email: string;
  password: string;
  baseUrl?: string;
  /** Must match the pickup location nickname in Shiprocket dashboard (Settings → Pickup Addresses). */
  pickupLocation?: string;
};

type ShiprocketCourierCompany = {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd?: string;
  estimated_delivery_days?: number;
};

type ShiprocketServiceabilityResponse = {
  data?: {
    available_courier_companies?: ShiprocketCourierCompany[];
  };
  status?: number;
};

type ShiprocketCreateOrderResponse = {
  order_id?: number | string;
  shipment_id?: number | string;
  status?: string;
  status_code?: number;
  awb_code?: string;
  courier_name?: string;
  label_url?: string;
};

type ShiprocketAssignAwbResponse = {
  awb_assign_status?: number;
  status_code?: number;
  message?: string;
  response?: {
    data?: {
      awb_code?: string;
      courier_name?: string;
      label_url?: string;
      awb_assign_error?: string;
      courier_id?: number | string;
    };
  };
};

type ShiprocketTrackActivity = {
  date?: string;
  status?: string;
  activity?: string;
  location?: string;
};

type ShiprocketTrackResponse = {
  tracking_data?: {
    shipment_status?: number;
    // Top-level human-readable status string (e.g. "Cancelled", "Delivered")
    current_status?: string;
    // shipment_track[0].current_status is an alternative location for the same field
    shipment_track?: Array<{ current_status?: string; [key: string]: unknown }>;
    shipment_track_activities?: ShiprocketTrackActivity[];
  };
};

type ShiprocketPickupResponse = {
  pickup_scheduled_date?: string;
  pickup_token_number?: string | number;
  status?: number;
};

type ShiprocketLabelResponse = {
  label_url?: string;
  status?: number;
};

export default class ShiprocketAdapter implements ShippingProviderAdapter {
  private readonly email: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly pickupLocation: string;
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(options: ShiprocketAdapterOptions) {
    this.email = options.email;
    this.password = options.password;
    this.baseUrl = options.baseUrl ?? SHIPROCKET_BASE_URL;
    const configuredLocation = options.pickupLocation?.trim();
    this.pickupLocation =
      configuredLocation && configuredLocation.length > 0 ? configuredLocation : DEFAULT_PICKUP_LOCATION;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password }),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : 'Network error';
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Shiprocket auth failed: ${message}`, 502);
    }
    clearTimeout(timer);

    if (!res.ok) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Shiprocket auth HTTP ${res.status}`, 502);
    }

    const data = await this.parseJson(res);
    const token = typeof data.token === 'string' ? data.token : null;
    if (!token) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shiprocket auth did not return a token', 502);
    }

    this.token = token;
    this.tokenExpiry = Date.now() + TOKEN_TTL_MS;
    return this.token;
  }

  private forceTokenRefresh(): void {
    this.token = null;
    this.tokenExpiry = 0;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    retryOnUnauthorized = true
  ): Promise<T> {
    const token = await this.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {})
        },
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : 'Network error';
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Shiprocket API request failed: ${message}`, 502);
    }
    clearTimeout(timer);

    if (res.status === 401 && retryOnUnauthorized) {
      this.forceTokenRefresh();
      return this.request<T>(path, init, false);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        `Shiprocket API HTTP ${res.status}: ${errBody.slice(0, 200)}`,
        502
      );
    }

    return this.parseJson(res) as Promise<T>;
  }

  private async parseJson(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shiprocket returned invalid JSON', 502);
    }
  }

  async checkServiceability(pincode: string, originPincode?: string): Promise<ServiceabilityResult> {
    const pickupPincode = originPincode ?? process.env.SHIPROCKET_PICKUP_PINCODE ?? '';
    const query = new URLSearchParams({
      pickup_postcode: pickupPincode,
      delivery_postcode: pincode,
      weight: '0.5',
      cod: '0'
    });

    const payload = await this.request<ShiprocketServiceabilityResponse>(
      `/courier/serviceability/?${query.toString()}`
    );

    const couriers = payload.data?.available_courier_companies ?? [];
    return {
      pincode,
      serviceable: couriers.length > 0,
      providerPayload: payload as Record<string, unknown>
    };
  }

  async calculateDeliveryRate(input: DeliveryRateInput): Promise<DeliveryRateResult> {
    const weightKg = Math.max(0.001, input.totalWeightGrams / 1000);
    const isCod = input.paymentMode === 'COD';
    const query = new URLSearchParams({
      pickup_postcode: input.originPincode,
      delivery_postcode: input.destinationPincode,
      weight: weightKg.toFixed(3),
      cod: isCod ? '1' : '0'
    });

    const payload = await this.request<ShiprocketServiceabilityResponse>(
      `/courier/serviceability/?${query.toString()}`
    );

    const couriers: ShiprocketCourierCompany[] = payload.data?.available_courier_companies ?? [];

    if (couriers.length === 0) {
      throw new AppError(ERROR_CODES.PINCODE_NOT_SERVICEABLE, 'No couriers available for this pincode', 422);
    }

    const sorted = [...couriers].sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
    const cheapest = sorted[0];
    if (!cheapest) {
      throw new AppError(ERROR_CODES.PINCODE_NOT_SERVICEABLE, 'No couriers available for this pincode', 422);
    }

    const availableCouriers = sorted.map((c) => ({
      courierCompanyId: c.courier_company_id,
      courierName: c.courier_name,
      shippingChargePaise: Math.round((c.rate ?? 0) * 100),
      estimatedDays: this.normalizeEstimatedDays(c.estimated_delivery_days ?? 4),
      ...(c.etd != null ? { estimatedDeliveryDate: c.etd } : {})
    }));

    return {
      shippingChargePaise: Math.round((cheapest.rate ?? 0) * 100),
      estimatedDays: this.normalizeEstimatedDays(cheapest.estimated_delivery_days ?? 4),
      courierName: cheapest.courier_name,
      courierCompanyId: cheapest.courier_company_id,
      ...(cheapest.etd != null ? { estimatedDeliveryDate: cheapest.etd } : {}),
      availableCouriers,
      providerPayload: payload as Record<string, unknown>
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const billingPhone = normalizeIndianShippingPhone(input.customer.phone);
    if (!billingPhone) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Shiprocket requires a valid 10-digit Indian billing phone number',
        422
      );
    }

    const orderDate = new Date().toISOString().split('T')[0] ?? new Date().toISOString().substring(0, 10);
    const defaultHsn = resolveDefaultShippingHsn();
    const resolvePayloadHsn = (raw?: string) => {
      const normalized = normalizeShippingHsn(raw ?? '');
      if (normalized) {
        return normalized;
      }
      return resolveShippingHsnCode({ defaultHsn });
    };

    const orderItems = (input.items ?? []).map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.quantity,
      selling_price: item.unitPriceRupees.toFixed(2),
      discount: '',
      tax: '',
      hsn: resolvePayloadHsn(item.hsnCode)
    }));

    if (orderItems.length === 0) {
      orderItems.push({
        name: 'Order',
        sku: input.orderNumber,
        units: 1,
        selling_price: input.amountRupees.toFixed(2),
        discount: '',
        tax: '',
        hsn: resolvePayloadHsn(input.hsnCode)
      });
    }

    const weightKg = Math.max(0.001, input.totalWeightGrams / 1000);
    const dimensions = input.dimensions ?? { lengthCm: 15, breadthCm: 15, heightCm: 10 };
    const subTotalRupees = input.subtotalRupees ?? input.amountRupees;
    const shippingChargeRupees = input.shippingChargeRupees ?? 0;
    const discountRupees = input.discountRupees ?? 0;
    const isCod = input.paymentMode === 'COD';
    const lineSubtotalRupees = orderItems.reduce(
      (sum, item) => sum + Number.parseFloat(item.selling_price) * item.units,
      0
    );
    const resolvedSubTotalRupees =
      Number.isFinite(lineSubtotalRupees) && lineSubtotalRupees > 0 ? lineSubtotalRupees : subTotalRupees;

    const createPayload: Record<string, unknown> = {
      order_id: input.orderNumber,
      order_date: orderDate,
      pickup_location: this.pickupLocation,
      billing_customer_name: input.customer.fullName,
      billing_last_name: '',
      billing_address: input.customer.line1,
      billing_address_2: input.customer.line2 ?? '',
      billing_city: input.customer.city,
      billing_pincode: input.destinationPincode,
      billing_state: input.customer.state,
      billing_country: 'India',
      billing_email: resolveShiprocketCustomerEmail(input.customer.email, input.storeContactEmail),
      billing_phone: billingPhone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: input.paymentMode,
      shipping_charges: shippingChargeRupees.toFixed(2),
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: discountRupees.toFixed(2),
      sub_total: resolvedSubTotalRupees.toFixed(2),
      length: dimensions.lengthCm,
      breadth: dimensions.breadthCm,
      height: dimensions.heightCm,
      weight: weightKg
    };
    if (isCod) {
      createPayload.cod_amount = input.amountRupees.toFixed(2);
    }

    const createData = await this.request<ShiprocketCreateOrderResponse>(
      '/orders/create/adhoc',
      {
        method: 'POST',
        body: JSON.stringify(createPayload)
      }
    );

    const shiprocketOrderId = createData.order_id != null ? String(createData.order_id) : null;
    const shiprocketShipmentId = createData.shipment_id != null ? String(createData.shipment_id) : null;

    if (!shiprocketShipmentId) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Shiprocket order created but no shipment_id returned',
        502
      );
    }

    const awbData = await this.request<ShiprocketAssignAwbResponse>(
      '/courier/assign/awb',
      {
        method: 'POST',
        body: JSON.stringify({
          shipment_id: [this.resolveShipmentIdPayload(shiprocketShipmentId)],
          ...(input.courierCompanyId != null ? { courier_id: input.courierCompanyId } : {})
        })
      }
    );

    // Extract AWB from success response or from "already assigned" idempotent error
    let awbNumber = awbData.response?.data?.awb_code ?? '';
    if (awbData.awb_assign_status !== 1) {
      const assignError = awbData.response?.data?.awb_assign_error ?? '';
      // Idempotency: Shiprocket returns status=0 if AWB was already assigned in a prior attempt
      const alreadyAssignedMatch = assignError.match(/AWB is already assigned with awb\s*-\s*(\S+)/i);
      if (alreadyAssignedMatch) {
        awbNumber = alreadyAssignedMatch[1] ?? '';
      } else {
        const reason = assignError || awbData.message || JSON.stringify(awbData);
        throw new AppError(
          ERROR_CODES.INTERNAL_ERROR,
          `Shiprocket AWB assignment failed: ${reason}`,
          502
        );
      }
    }

    if (!awbNumber) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shiprocket AWB code missing from assign response', 502);
    }

    // Fetch estimated delivery days by checking serviceability for the assigned route.
    // This is a lightweight read-only call and the result is stored on the Shipment record.
    let estimatedDays: number | undefined;
    try {
      const rateResult = await this.calculateDeliveryRate({
        originPincode: input.originPincode,
        destinationPincode: input.destinationPincode,
        totalWeightGrams: input.totalWeightGrams,
        paymentMode: input.paymentMode === 'COD' ? 'COD' : 'PREPAID'
      });
      estimatedDays = rateResult.estimatedDays;
    } catch {
      // Non-critical — proceed without estimated days
    }

    return {
      awbNumber,
      trackingUrl: `https://shiprocket.co/tracking/${awbNumber}`,
      ...(estimatedDays != null ? { estimatedDays } : {}),
      ...(shiprocketOrderId != null ? { shiprocketOrderId } : {}),
      shiprocketShipmentId,
      ...(awbData.response?.data?.courier_name != null ? { courierName: awbData.response.data.courier_name } : {}),
      ...(awbData.response?.data?.label_url != null ? { labelUrl: awbData.response.data.label_url } : {}),
      providerPayload: {
        createOrder: createData as Record<string, unknown>,
        assignAwb: awbData as Record<string, unknown>
      }
    };
  }

  async trackShipment(awbNumber: string): Promise<TrackShipmentResult> {
    const payload = await this.request<ShiprocketTrackResponse>(
      `/courier/track/awb/${encodeURIComponent(awbNumber)}`
    );

    const trackingData = payload.tracking_data;
    const activities = trackingData?.shipment_track_activities ?? [];
    // Prefer header-level current_status (human-readable: "Shipped", "Delivered",
    // "Cancelled") because activity-level statuses carry raw courier codes
    // (e.g. "DTUP-210") that cannot be mapped to internal statuses.
    // Fall back to activity status only if the header fields are absent.
    const latestStatus =
      trackingData?.current_status ||
      trackingData?.shipment_track?.[0]?.current_status ||
      activities[0]?.status ||
      'UNKNOWN';

    const events = activities.map((a) => ({
      status: a.status ?? 'UNKNOWN',
      ...(a.location != null ? { location: a.location } : {}),
      description: a.activity ?? a.status ?? '',
      occurredAt: a.date ?? new Date().toISOString()
    }));

    return {
      status: latestStatus,
      events,
      providerPayload: payload as Record<string, unknown>
    };
  }

  async cancelShipment(awbNumber: string): Promise<{ cancelled: boolean; providerPayload: Record<string, unknown> }> {
    try {
      const payload = await this.request<Record<string, unknown>>(
        '/orders/cancel',
        {
          method: 'POST',
          body: JSON.stringify({ ids: [awbNumber] })
        }
      );
      const cancelled =
        typeof payload.message === 'string' && payload.message.toLowerCase().includes('cancel');
      return { cancelled, providerPayload: payload };
    } catch {
      return {
        cancelled: false,
        providerPayload: { reason: 'Shiprocket cancel API call failed' }
      };
    }
  }

  async schedulePickup(shiprocketShipmentId: string): Promise<SchedulePickupResult> {
    const shipmentId = this.resolveShipmentIdPayload(shiprocketShipmentId);
    const payload = await this.request<ShiprocketPickupResponse>(
      '/courier/generate/pickup',
      {
        method: 'POST',
        body: JSON.stringify({ shipment_id: [shipmentId] })
      }
    );

    return {
      scheduled: (payload.status ?? 0) === 1,
      ...(payload.pickup_scheduled_date != null ? { pickupScheduledDate: payload.pickup_scheduled_date } : {}),
      ...(payload.pickup_token_number != null ? { pickupTokenNumber: String(payload.pickup_token_number) } : {}),
      providerPayload: payload as Record<string, unknown>
    };
  }

  async generateLabel(shiprocketShipmentId: string): Promise<GenerateLabelResult> {
    const shipmentId = this.resolveShipmentIdPayload(shiprocketShipmentId);
    const payload = await this.request<ShiprocketLabelResponse>(
      '/courier/generate/label',
      {
        method: 'POST',
        body: JSON.stringify({ shipment_id: [shipmentId] })
      }
    );

    const labelUrl = payload.label_url ?? '';
    if (!labelUrl) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shiprocket label generation did not return a URL', 502);
    }

    return {
      labelUrl,
      providerPayload: payload as Record<string, unknown>
    };
  }

  private normalizeEstimatedDays(value: number): number {
    const days = Math.floor(value);
    if (days < 1) return 1;
    if (days > 30) return 30;
    return days;
  }

  private resolveShipmentIdPayload(shiprocketShipmentId: string): number | string {
    const parsed = Number.parseInt(shiprocketShipmentId, 10);
    return Number.isFinite(parsed) ? parsed : shiprocketShipmentId;
  }
}
