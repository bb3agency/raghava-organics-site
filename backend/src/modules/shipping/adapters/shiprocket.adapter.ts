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

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // 9 days (buffer before 10d expiry)
const REQUEST_TIMEOUT_MS = 10_000; // 10s abort timeout on every fetch

type ShiprocketAdapterOptions = {
  email: string;
  password: string;
  baseUrl?: string;
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
  response?: {
    data?: {
      awb_assign_status?: number;
      awb_code?: string;
      courier_name?: string;
      label_url?: string;
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
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(options: ShiprocketAdapterOptions) {
    this.email = options.email;
    this.password = options.password;
    this.baseUrl = options.baseUrl ?? SHIPROCKET_BASE_URL;
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
      return { raw: text };
    }
  }

  async checkServiceability(pincode: string): Promise<ServiceabilityResult> {
    const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE ?? '';
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
    const query = new URLSearchParams({
      pickup_postcode: input.originPincode,
      delivery_postcode: input.destinationPincode,
      weight: weightKg.toFixed(3),
      cod: '0'
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
    const orderDate = new Date().toISOString().split('T')[0] ?? new Date().toISOString().substring(0, 10);

    const orderItems = (input.items ?? []).map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.quantity,
      selling_price: item.unitPriceRupees.toFixed(2),
      discount: '',
      tax: '',
      hsn: item.hsnCode ?? ''
    }));

    if (orderItems.length === 0) {
      orderItems.push({
        name: 'Order',
        sku: input.orderNumber,
        units: 1,
        selling_price: input.amountRupees.toFixed(2),
        discount: '',
        tax: '',
        hsn: input.hsnCode
      });
    }

    const weightKg = Math.max(0.001, input.totalWeightGrams / 1000);
    const dimensions = input.dimensions ?? { lengthCm: 15, breadthCm: 15, heightCm: 10 };

    const createPayload = {
      order_id: input.orderNumber,
      order_date: orderDate,
      pickup_location: 'Primary',
      billing_customer_name: input.customer.fullName,
      billing_last_name: '',
      billing_address: input.customer.line1,
      billing_address_2: input.customer.line2 ?? '',
      billing_city: input.customer.city,
      billing_pincode: input.destinationPincode,
      billing_state: input.customer.state,
      billing_country: 'India',
      billing_email: input.customer.email ?? '',
      billing_phone: input.customer.phone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: input.paymentMode,
      shipping_charges: 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: 0,
      sub_total: input.amountRupees.toFixed(2),
      length: dimensions.lengthCm,
      breadth: dimensions.breadthCm,
      height: dimensions.heightCm,
      weight: weightKg
    };

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
          shipment_id: [shiprocketShipmentId],
          ...(input.courierCompanyId != null ? { courier_id: input.courierCompanyId } : {})
        })
      }
    );

    const awbResponse = awbData.response?.data;
    if (!awbResponse || awbResponse.awb_assign_status !== 1) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Shiprocket AWB assignment failed',
        502
      );
    }

    const awbNumber = awbResponse.awb_code ?? '';
    if (!awbNumber) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Shiprocket AWB code missing from assign response', 502);
    }

    return {
      awbNumber,
      trackingUrl: `https://shiprocket.co/tracking/${awbNumber}`,
      ...(shiprocketOrderId != null ? { shiprocketOrderId } : {}),
      shiprocketShipmentId,
      ...(awbResponse.courier_name != null ? { courierName: awbResponse.courier_name } : {}),
      ...(awbResponse.label_url != null ? { labelUrl: awbResponse.label_url } : {}),
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
    const latestStatus = activities[0]?.status ?? 'UNKNOWN';

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
    const payload = await this.request<ShiprocketPickupResponse>(
      '/courier/generate/pickup',
      {
        method: 'POST',
        body: JSON.stringify({ shipment_id: [shiprocketShipmentId] })
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
    const payload = await this.request<ShiprocketLabelResponse>(
      '/courier/generate/label',
      {
        method: 'POST',
        body: JSON.stringify({ shipment_id: [shiprocketShipmentId] })
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
}
