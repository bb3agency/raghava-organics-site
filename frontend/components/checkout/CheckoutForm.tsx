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
  fullName: z.string().min(2).max(100),
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
            fullName: values.fullName,
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
    <form onSubmit={submit} className="grid gap-6 rounded-[20px] bg-white p-6 shadow-sm lg:p-8">
      <h2 className="font-heading text-xl font-bold text-[#23403d]">Billing Details</h2>
      <div className="grid gap-1.5">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="fullName">
          Full Name
        </label>
        <input
          id="fullName"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          placeholder="John Doe"
          {...form.register("fullName")}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            {...form.register("email")}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            {...form.register("phone")}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="address">
          Street Address
        </label>
        <textarea
          id="address"
          className="min-h-24 w-full rounded-[20px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("address")}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="city">
            City
          </label>
          <input
            id="city"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            {...form.register("city")}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="state">
            State
          </label>
          <input
            id="state"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            {...form.register("state")}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="pincode">
            Pincode
          </label>
          <input
            id="pincode"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            {...form.register("pincode")}
          />
        </div>
      </div>
      
      <fieldset className="grid gap-3 pt-4 border-t border-[#efe8e4]">
        <legend className="text-lg font-bold text-[#23403d] mb-2">Payment Mode</legend>
        <label className="flex items-center gap-3 text-sm font-bold text-[#23403d] cursor-pointer">
          <input type="radio" value="PREPAID" className="size-4 text-[#ec6e55] focus:ring-[#ec6e55]" {...form.register("paymentMode")} />
          Pay online (Razorpay)
        </label>
        {isCodEnabled ? (
          <label className="flex items-center gap-3 text-sm font-bold text-[#23403d] cursor-pointer">
            <input type="radio" value="COD" className="size-4 text-[#ec6e55] focus:ring-[#ec6e55]" {...form.register("paymentMode")} />
            Cash on delivery
          </label>
        ) : (
          <p className="text-xs font-bold text-[#767676]">
            COD is currently disabled by store settings.
          </p>
        )}
      </fieldset>

      <div className="grid gap-1.5 border-t border-[#efe8e4] pt-4">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="notes">
          Order Notes (optional)
        </label>
        <textarea
          id="notes"
          className="min-h-24 w-full rounded-[20px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          placeholder="Notes about your order, e.g. special notes for delivery."
          {...form.register("notes")}
        />
      </div>

      <button
        type="submit"
        className="mt-4 h-14 w-full rounded-full bg-[#23403d] text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Processing..." : "Place order"}
      </button>

      {error ? (
        <p className="rounded-[10px] bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-[10px] bg-[#eff5ee] px-4 py-3 text-sm font-bold text-[#00aa63]">
          {statusMessage}
        </p>
      ) : null}
      {createdOrderId ? (
        <p className="text-center text-xs font-bold text-[#767676]">Order ID: {createdOrderId}</p>
      ) : null}
    </form>
  );
}
