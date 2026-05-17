import { apiClient } from "@/lib/api";
import { createIdempotencyKey } from "@/lib/idempotency";

export type CheckoutPaymentMode = "PREPAID" | "COD";

export interface CheckoutShippingAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CreateOrderInput {
  addressId?: string;
  shippingAddress?: CheckoutShippingAddressInput;
  notes?: string;
  paymentMode?: CheckoutPaymentMode;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMode: CheckoutPaymentMode;
  subtotal: number;
  shippingCharge: number;
  discountAmount: number;
  total: number;
}

export interface InitiatePaymentResponse {
  orderId: string;
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export async function createOrder(
  input: CreateOrderInput,
  accessToken: string,
  idempotencyKey = createIdempotencyKey(),
): Promise<OrderSummary> {
  return apiClient<OrderSummary>("/orders", {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify(input),
  });
}

export async function initiatePayment(
  orderId: string,
  accessToken: string,
  idempotencyKey = createIdempotencyKey(),
): Promise<InitiatePaymentResponse> {
  return apiClient<InitiatePaymentResponse>("/payments/initiate", {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify({ orderId }),
  });
}

export async function verifyPayment(
  input: VerifyPaymentInput,
  accessToken: string,
  idempotencyKey = createIdempotencyKey(),
): Promise<{ message: string }> {
  return apiClient<{ message: string }>("/payments/verify", {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify(input),
  });
}

export async function retryPayment(
  orderId: string,
  accessToken: string,
  idempotencyKey = createIdempotencyKey(),
): Promise<InitiatePaymentResponse> {
  return apiClient<InitiatePaymentResponse>("/payments/retry", {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify({ orderId }),
  });
}

export async function getMyOrder(id: string, accessToken: string): Promise<OrderSummary> {
  return apiClient<OrderSummary>(`/orders/${id}`, {
    method: "GET",
    accessToken,
  });
}
