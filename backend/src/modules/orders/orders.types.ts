import { OrderStatus, ReturnRequestStatus } from '@prisma/client';

export type { ReturnRequestStatus };

export type AdminOrderListQuery = {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  from?: string;
  to?: string;
  search?: string;
};

export type AdminOrderExportQuery = {
  from: string;
  to: string;
  status?: OrderStatus;
  search?: string;
};

export type UpdateOrderStatusInput = {
  status: OrderStatus;
  note?: string;
  refundAmountPaise?: number;
};

export type CreateOrderInput = {
  addressId?: string;
  shippingAddress?: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  notes?: string;
  paymentMode?: 'PREPAID' | 'COD';
};

export type RetryPaymentInput = {
  orderId: string;
};

export type CreateReturnRequestInput = {
  items: Array<{
    orderItemId: string;
    quantity: number;
    reason?: string;
  }>;
  reason: string;
};

export type UpdateReturnRequestInput = {
  status: ReturnRequestStatus;
  adminNote?: string;
};

export type InitiatePaymentInput = {
  orderId: string;
};

export type VerifyPaymentInput = {
  orderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type CancelOrderInput = {
  reason?: string;
  refundAmountPaise?: number;
};

export type ShippingTrackParams = {
  awb: string;
};

export type AdminRetriggerNotificationInput = {
  template: 'OrderConfirmed' | 'PaymentFailed' | 'OrderShipped' | 'OutForDelivery' | 'OrderDelivered' | 'OrderCancelled';
  channels?: Array<'EMAIL' | 'SMS' | 'WHATSAPP'>;
};

