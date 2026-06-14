export type AdminPaymentMode = "PREPAID" | "COD";

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  paymentMode: AdminPaymentMode;
  paymentStatus: string | null;
  canShipNow: boolean;
}

export interface AdminOrdersListResponse {
  items: AdminOrderListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ShippingProviderEnum = "DELHIVERY" | "SHIPROCKET" | "SELF";

export interface AdminOrderShipment {
  id: string;
  provider: ShippingProviderEnum;
  status: string;
  awb: string | null;
  trackingUrl: string | null;
  shipmentLabelUrl?: string | null;
  /** Only present for Shiprocket shipments */
  shiprocketShipmentId?: string | null;
  labelUrl?: string | null;
  pickupScheduledDate?: string | null;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentMode: AdminPaymentMode;
  canShipNow: boolean;
  shipBlockReason: string | null;
  shippingMode: "MANUAL";
  payment: {
    status: string;
    provider: string;
    capturedAt: string | null;
  } | null;
  shipment: AdminOrderShipment | null;
  invoice: {
    invoiceNumber: string;
    hasPdf: boolean;
  } | null;
}

export interface AdminPrintLabelResponse {
  labelUrl: string;
}

export interface AdminSchedulePickupResponse {
  pickupScheduledDate?: string;
}
