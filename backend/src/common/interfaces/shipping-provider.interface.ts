export type CreateShipmentInput = {
  orderNumber: string;
  amountRupees: number;
  /** Product subtotal before shipping/discount (rupees). Falls back to amountRupees when omitted. */
  subtotalRupees?: number;
  shippingChargeRupees?: number;
  discountRupees?: number;
  destinationPincode: string;
  originPincode: string;
  totalWeightGrams: number;
  paymentMode: 'Prepaid' | 'COD';
  sellerGstTin: string;
  hsnCode: string;
  customer: {
    fullName: string;
    phone: string;
    email?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
  };
  /** Store contact email used when customer email is absent (Shiprocket requires billing_email). */
  storeContactEmail?: string;
  items?: Array<{
    name: string;
    sku: string;
    quantity: number;
    /** Per-unit selling price in rupees (after line-level discounts). */
    unitPriceRupees: number;
    hsnCode?: string;
  }>;
  courierCompanyId?: number;
  dimensions?: {
    lengthCm: number;
    breadthCm: number;
    heightCm: number;
  };
};

export type CreateShipmentResult = {
  awbNumber: string;
  trackingUrl?: string;
  estimatedDays?: number;
  providerPayload: Record<string, unknown>;
  shiprocketOrderId?: string;
  shiprocketShipmentId?: string;
  courierName?: string;
  labelUrl?: string;
};

export type TrackShipmentResult = {
  status: string;
  events: Array<{
    status: string;
    location?: string;
    description: string;
    occurredAt: string;
  }>;
  providerPayload: Record<string, unknown>;
};

export type ServiceabilityResult = {
  pincode: string;
  serviceable: boolean;
  providerPayload: Record<string, unknown>;
};

export type DeliveryRateInput = {
  destinationPincode: string;
  originPincode: string;
  totalWeightGrams: number;
  /** When COD, adapters quote COD freight instead of prepaid. */
  paymentMode?: 'COD' | 'PREPAID';
};

export type CourierOption = {
  courierCompanyId: number;
  courierName: string;
  shippingChargePaise: number;
  estimatedDays: number;
  estimatedDeliveryDate?: string;
};

export type DeliveryRateResult = {
  shippingChargePaise: number;
  estimatedDays: number;
  courierName?: string;
  courierCompanyId?: number;
  estimatedDeliveryDate?: string;
  availableCouriers?: CourierOption[];
  providerPayload: Record<string, unknown>;
};

export type SchedulePickupResult = {
  scheduled: boolean;
  pickupScheduledDate?: string;
  pickupTokenNumber?: string;
  providerPayload: Record<string, unknown>;
};

export type GenerateLabelResult = {
  labelUrl: string;
  providerPayload: Record<string, unknown>;
};

export interface ShippingProviderAdapter {
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  trackShipment(awbNumber: string): Promise<TrackShipmentResult>;
  cancelShipment(awbNumber: string): Promise<{ cancelled: boolean; providerPayload: Record<string, unknown> }>;
  checkServiceability(pincode: string, originPincode?: string): Promise<ServiceabilityResult>;
  calculateDeliveryRate(input: DeliveryRateInput): Promise<DeliveryRateResult>;
  schedulePickup?(shiprocketShipmentId: string): Promise<SchedulePickupResult>;
  generateLabel?(shiprocketShipmentId: string): Promise<GenerateLabelResult>;
}
