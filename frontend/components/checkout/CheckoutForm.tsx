"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { checkPincodeServiceability } from "@/lib/cart-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { createOrder, initiatePayment, verifyPayment } from "@/lib/orders-api";
import { formatPrice } from "@/lib/format-price";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const schema = z.object({
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  address: z.string().min(10),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().length(6),
  paymentMode: z.enum(["PREPAID", "COD"]),
  notes: z.string().max(2000).optional(),
});

type CheckoutValues = z.infer<typeof schema>;

interface CheckoutFormProps {
  isCodEnabled: boolean;
}

export function CheckoutForm({ isCodEnabled }: CheckoutFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const cart = useCartStore((s) => s.cart);
  const setCart = useCartStore((s) => s.setCart);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMode: "PREPAID",
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      if (!accessToken) {
        setError("Please sign in before placing an order.");
        return;
      }
      setError(null);
      setStatusMessage(null);
      if (!isCodEnabled && values.paymentMode === "COD") {
        setError("COD is currently unavailable. Please choose prepaid.");
        return;
      }
      const pincodeResult = await checkPincodeServiceability(values.pincode);
      if (!pincodeResult.serviceable) {
        setError("Delivery is not available at this pincode.");
        return;
      }

      const orderIdempotencyKey = createIdempotencyKey();
      const order = await createOrder(
        {
          paymentMode: values.paymentMode,
          shippingAddress: {
            fullName: values.email.split("@")[0] || "Customer",
            phone: values.phone,
            line1: values.address,
            city: values.city,
            state: values.state,
            pincode: values.pincode,
          },
          notes: values.notes,
        },
        accessToken,
        orderIdempotencyKey,
      );
      setCreatedOrderId(order.id);

      if (values.paymentMode === "COD") {
        clearPendingMerge();
        setStatusMessage(
          `COD order ${order.orderNumber} confirmed. Total: ${formatPrice(order.total)}`,
        );
        router.push("/orders");
        return;
      }

      const paymentInitKey = createIdempotencyKey();
      const payment = await initiatePayment(order.id, accessToken, paymentInitKey);
      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        setStatusMessage(
          `Order ${order.orderNumber} created. Set NEXT_PUBLIC_RAZORPAY_KEY_ID to continue prepaid checkout.`,
        );
        return;
      }
      if (!window.Razorpay) {
        setError("Razorpay SDK unavailable. Refresh and try again.");
        return;
      }

      const verifyKey = createIdempotencyKey();
      const razorpay = new window.Razorpay({
        key: razorpayKey,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.providerOrderId,
        name: "Raghava Organics",
        description: `Order ${order.orderNumber}`,
        prefill: {
          email: values.email,
          contact: values.phone,
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await verifyPayment(
              {
                orderId: order.id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              accessToken,
              verifyKey,
            );
            setStatusMessage(
              `Payment verified for ${order.orderNumber}. Final confirmation will sync shortly.`,
            );
            setCart(cart);
            router.push("/orders");
          } catch (verifyError) {
            setError(getApiErrorMessage(verifyError));
          }
        },
      });

      razorpay.open();
    } catch (err) {
      setError(getApiErrorMessage(err));
      setStatusMessage(null);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="h-11 rounded-md border border-border px-3 text-sm"
          {...form.register("email")}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          className="h-11 rounded-md border border-border px-3 text-sm"
          {...form.register("phone")}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="address">
          Address
        </label>
        <textarea
          id="address"
          className="min-h-20 rounded-md border border-border px-3 py-2 text-sm"
          {...form.register("address")}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="city">
          City
        </label>
        <input
          id="city"
          className="h-11 rounded-md border border-border px-3 text-sm"
          {...form.register("city")}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="state">
          State
        </label>
        <input
          id="state"
          className="h-11 rounded-md border border-border px-3 text-sm"
          {...form.register("state")}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="pincode">
          Pincode
        </label>
        <input
          id="pincode"
          className="h-11 rounded-md border border-border px-3 text-sm"
          {...form.register("pincode")}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Payment mode</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="PREPAID" {...form.register("paymentMode")} />
          Pay online (Razorpay)
        </label>
        {isCodEnabled ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="COD" {...form.register("paymentMode")} />
            Cash on delivery
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            COD is currently disabled by store settings.
          </p>
        )}
      </fieldset>
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="notes">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          className="min-h-16 rounded-md border border-border px-3 py-2 text-sm"
          {...form.register("notes")}
        />
      </div>

      <button
        type="submit"
        className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Processing..." : "Place order"}
      </button>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {statusMessage}
        </p>
      ) : null}
      {createdOrderId ? (
        <p className="text-xs text-muted-foreground">Order ID: {createdOrderId}</p>
      ) : null}
    </form>
  );
}
