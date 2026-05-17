"use server";

import { revalidatePath } from "next/cache";
import {
  createOrder,
  initiatePayment,
  retryPayment,
  type CheckoutPaymentMode,
  type CheckoutShippingAddressInput,
} from "@/lib/orders-api";

interface CreateCheckoutOrderInput {
  accessToken: string;
  paymentMode: CheckoutPaymentMode;
  shippingAddress: CheckoutShippingAddressInput;
  notes?: string;
}

export async function createCheckoutOrderAction(input: CreateCheckoutOrderInput) {
  const order = await createOrder(
    {
      paymentMode: input.paymentMode,
      shippingAddress: input.shippingAddress,
      notes: input.notes,
    },
    input.accessToken,
  );
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return order;
}

export async function initiateCheckoutPaymentAction(
  accessToken: string,
  orderId: string,
) {
  return initiatePayment(orderId, accessToken);
}

export async function retryCheckoutPaymentAction(
  accessToken: string,
  orderId: string,
) {
  return retryPayment(orderId, accessToken);
}
