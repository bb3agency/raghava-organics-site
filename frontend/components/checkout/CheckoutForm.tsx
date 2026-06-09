"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, AlertTriangle } from "lucide-react";
import { checkPincodeServiceability, getDeliveryRates } from "@/lib/cart-api";
import { getApiErrorMessage, getApiErrorMessageWithHint } from "@/lib/error-messages";
import { ApiError } from "@/lib/api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { createMyAddress, getMyAddresses, type UserAddress } from "@/lib/users-api";
import { createOrder, initiatePayment, verifyPayment } from "@/lib/orders-api";
import { formatPrice } from "@/lib/format-price";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const schema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(10).max(15),
  line1: z.string().min(5).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().length(6),
  paymentMode: z.enum(["PREPAID", "COD"]),
  notes: z.string().max(2000).optional(),
  saveAddress: z.boolean().optional(),
});

type CheckoutValues = z.infer<typeof schema>;

type AddressFieldName = Extract<
  keyof CheckoutValues,
  "fullName" | "phone" | "line1" | "line2" | "city" | "state" | "pincode"
>;

interface CheckoutFormProps {
  isCodEnabled: boolean;
  /** Minimum cart subtotal in paise (from backend DB). 0 = no minimum. */
  minOrderValuePaise: number;
  /** False when store config could not be loaded — checkout must stay blocked. */
  configAvailable?: boolean;
}

function addressToFormValues(addr: UserAddress): Partial<CheckoutValues> {
  return {
    fullName: addr.fullName,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2 ?? "",
    city: addr.city,
    state: addr.state,
    pincode: addr.pincode,
  };
}

export function CheckoutForm({
  isCodEnabled,
  minOrderValuePaise,
  configAvailable = true,
}: CheckoutFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingQuote, setShippingQuote] = useState<{ shippingCharge: number; estimatedDays: number } | null>(null);
  const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
  const [shippingQuoteError, setShippingQuoteError] = useState<string | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore((s) => s.cart);
  const clearCart = useCartStore((s) => s.clearCart);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMode: "PREPAID",
      fullName: user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "",
      saveAddress: false,
    },
  });

  useEffect(() => {
    if (!accessToken) return;
    getMyAddresses(accessToken)
      .then((addrs) => {
        setSavedAddresses(addrs);
        const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (defaultAddr) {
          setSelectedAddressId(defaultAddr.id);
          const patch = addressToFormValues(defaultAddr);
          for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) {
              form.setValue(key as keyof CheckoutValues, value as string);
            }
          }
        }
      })
      .catch(() => { /* non-fatal */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [accessToken]);

  const pincode = form.watch("pincode");
  const paymentMode = form.watch("paymentMode");

  useEffect(() => {
    if (!accessToken || !pincode || pincode.length !== 6) {
      setShippingQuote(null);
      setShippingQuoteError(null);
      return;
    }
    let cancelled = false;
    setShippingQuoteLoading(true);
    setShippingQuoteError(null);
    void getDeliveryRates(pincode, accessToken, paymentMode)
      .then((rates) => {
        if (!cancelled) {
          setShippingQuote({
            shippingCharge: rates.shippingCharge,
            estimatedDays: rates.estimatedDays,
          });
          setShippingQuoteError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setShippingQuote(null);
          setShippingQuoteError(getApiErrorMessageWithHint(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setShippingQuoteLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, pincode, paymentMode]);

  const clearSavedAddressOnManualEdit = () => {
    if (selectedAddressId) setSelectedAddressId(null);
  };

  const registerAddressField = (name: AddressFieldName) => {
    const { onChange, ...rest } = form.register(name);
    return {
      ...rest,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        void onChange(event);
        clearSavedAddressOnManualEdit();
      },
    };
  };

  if (!accessToken) {
    return (
      <div className="rounded-[20px] bg-white p-6 shadow-sm text-center">
        <p className="mb-4 text-sm font-medium text-[#767676]">
          Please sign in to place an order.
        </p>
        <Link
          href="/login?redirect=/checkout"
          className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-colors hover:bg-[#ec6e55]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const selectSavedAddress = (addr: UserAddress) => {
    setSelectedAddressId(addr.id);
    form.reset({ ...form.getValues(), ...addressToFormValues(addr), saveAddress: false });
  };

  const cartItems = cart?.items ?? [];
  const cartSubtotal = cart?.subtotal ?? cartItems.reduce((s, i) => s + i.priceSnapshot * i.quantity, 0);
  const cartDiscount = cart?.discountAmount ?? 0;
  const cartPayableTotal = cart?.total ?? cartSubtotal;
  const effectiveMinOrderPaise = cart?.minOrderValuePaise ?? minOrderValuePaise;
  const meetsMinimumOrder =
    cart?.meetsMinimumOrder ??
    (effectiveMinOrderPaise === 0 || cartSubtotal >= effectiveMinOrderPaise);
  const belowMinOrder = configAvailable && !meetsMinimumOrder && effectiveMinOrderPaise > 0;
  const checkoutBlocked = !configAvailable || belowMinOrder;
  const shippingCharge = shippingQuote?.shippingCharge ?? 0;
  const hasShippingQuote = shippingQuote !== null && !shippingQuoteError;
  const estimatedPayableTotal = hasShippingQuote
    ? Math.max(cartPayableTotal + shippingCharge, 0)
    : cartPayableTotal;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      if (!isCodEnabled && values.paymentMode === "COD") {
        setError("COD is currently unavailable. Please choose prepaid.");
        setSubmitting(false);
        return;
      }
      if (!meetsMinimumOrder && effectiveMinOrderPaise > 0) {
        setError(
          `Your cart subtotal doesn't meet the minimum of ${formatPrice(effectiveMinOrderPaise)}. Please add more items to your cart.`,
        );
        setSubmitting(false);
        return;
      }
      const pincodeResult = await checkPincodeServiceability(values.pincode);
      if (!pincodeResult.serviceable) {
        setError("Delivery is not available at this pincode.");
        setSubmitting(false);
        return;
      }

      let addressId = selectedAddressId;

      if (!addressId && values.saveAddress) {
        const created = await createMyAddress(accessToken, {
          fullName: values.fullName,
          phone: values.phone,
          line1: values.line1,
          ...(values.line2?.trim() ? { line2: values.line2.trim() } : {}),
          city: values.city,
          state: values.state,
          pincode: values.pincode,
          isDefault: savedAddresses.length === 0,
        });
        addressId = created.id;
        setSavedAddresses((prev) => [...prev, created]);
      }

      const orderIdempotencyKey = createIdempotencyKey();
      const order = await createOrder(
        addressId
          ? {
              addressId,
              paymentMode: values.paymentMode,
              notes: values.notes,
            }
          : {
              paymentMode: values.paymentMode,
              shippingAddress: {
                fullName: values.fullName,
                phone: values.phone,
                line1: values.line1,
                ...(values.line2?.trim() ? { line2: values.line2.trim() } : {}),
                city: values.city,
                state: values.state,
                pincode: values.pincode,
              },
              notes: values.notes,
            },
        accessToken,
        orderIdempotencyKey,
      );

      if (values.paymentMode === "COD") {
        clearPendingMerge();
        clearCart();
        router.push(`/checkout/success?orderId=${order.id}`);
        return;
      }

      const paymentInitKey = createIdempotencyKey();
      const payment = await initiatePayment(order.id, accessToken, paymentInitKey);
      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        setError("Payment gateway is not configured. Contact support.");
        setSubmitting(false);
        return;
      }
      if (!window.Razorpay) {
        setError("Payment SDK unavailable. Refresh and try again.");
        setSubmitting(false);
        return;
      }

      const verifyKey = createIdempotencyKey();
      const razorpay = new window.Razorpay({
        key: razorpayKey,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.providerOrderId,
        name: process.env.NEXT_PUBLIC_STORE_NAME ?? "Raghava Organics",
        description: `Order ${order.orderNumber}`,
        prefill: {
          name: values.fullName,
          contact: values.phone,
          ...(user?.email ? { email: user.email } : {}),
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
            clearPendingMerge();
            clearCart();
            router.push(`/checkout/success?orderId=${order.id}`);
          } catch (verifyError) {
            setError(getApiErrorMessage(verifyError));
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            setError(
              `Payment was not completed. Your order ${order.orderNumber} is saved — you can complete payment from your order history.`,
            );
          },
        },
      });

      razorpay.open();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setError(getApiErrorMessageWithHint(err));
      } else {
        setError(getApiErrorMessage(err));
      }
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-[20px] bg-white p-4 shadow-sm sm:gap-6 sm:p-6 lg:p-8">
      <h2 className="font-heading text-xl font-bold text-[#23403d]">Shipping Details</h2>

      {savedAddresses.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-bold text-[#767676] flex items-center gap-1">
            <MapPin className="size-4" aria-hidden /> Saved addresses
          </p>
          <div className="flex flex-wrap gap-2">
            {savedAddresses.map((addr) => (
              <button
                key={addr.id}
                type="button"
                onClick={() => selectSavedAddress(addr)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors text-left ${
                  selectedAddressId === addr.id
                    ? "border-[#23403d] bg-[#23403d] text-white"
                    : "border-[#efe8e4] bg-[#faf3ef] text-[#23403d] hover:border-[#23403d]"
                }`}
              >
                {addr.fullName} — {addr.line1}, {addr.city}
                {addr.isDefault ? " (default)" : ""}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#767676]">
            Manage addresses in{" "}
            <Link href="/settings" className="font-bold text-[#ec6e55] underline">
              account settings
            </Link>
            .
          </p>
        </div>
      )}

      {cartItems.length > 0 && (
        <div className="rounded-[12px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm">
          <p className="font-bold text-[#23403d] mb-1">Order summary</p>
          {cartItems.map((item) => (
            <div key={item.id} className="flex justify-between text-xs text-[#767676]">
              <span>{item.variant?.name ?? "Item"} × {item.quantity}</span>
              <span>{formatPrice(item.priceSnapshot * item.quantity)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-[#efe8e4] pt-2 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between text-[#767676]">
              <span>Subtotal</span>
              <span>{formatPrice(cartSubtotal)}</span>
            </div>
            {cartDiscount > 0 ? (
              <div className="flex justify-between text-[#00aa63]">
                <span>Discount</span>
                <span>-{formatPrice(cartDiscount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold text-[#23403d]">
              <span>Total</span>
              <span>{formatPrice(cartPayableTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {!configAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Store settings are temporarily unavailable. Please refresh the page before placing an order.
        </div>
      ) : null}
      {belowMinOrder ? (
        <div className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-xs font-bold text-amber-800">
            Add {formatPrice(effectiveMinOrderPaise - cartSubtotal)} more to reach the{" "}
            {formatPrice(effectiveMinOrderPaise)} minimum order value.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
            placeholder="John Doe"
            {...registerAddressField("fullName")}
          />
          {form.formState.errors.fullName && (
            <p className="text-xs text-red-600">{form.formState.errors.fullName.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="phone">Phone</label>
          <input
            id="phone"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            placeholder="9876543210"
            {...registerAddressField("phone")}
          />
          {form.formState.errors.phone && (
            <p className="text-xs text-red-600">{form.formState.errors.phone.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="line1">Address line 1</label>
        <input
          id="line1"
          className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
          placeholder="House/Flat No., Street, Locality"
          {...registerAddressField("line1")}
        />
        {form.formState.errors.line1 && (
          <p className="text-xs text-red-600">{form.formState.errors.line1.message}</p>
        )}
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="line2">
          Address line 2 <span className="font-normal text-[#767676]">(optional)</span>
        </label>
        <input
          id="line2"
          className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
          placeholder="Landmark, apartment, etc."
          {...registerAddressField("line2")}
        />
      </div>

      <div className="grid gap-3 grid-cols-1 sm:gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="city">City</label>
          <input
            id="city"
            className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
            {...registerAddressField("city")}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="state">State</label>
          <input
            id="state"
            className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
            {...registerAddressField("state")}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-bold text-[#23403d]" htmlFor="pincode">Pincode</label>
          <input
            id="pincode"
            className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d] sm:h-12"
            maxLength={6}
            {...registerAddressField("pincode")}
          />
        </div>
      </div>

      {!selectedAddressId && (
        <label className="flex items-center gap-2 text-sm font-medium text-[#23403d] cursor-pointer">
          <input
            type="checkbox"
            className="size-4 accent-[#ec6e55]"
            {...form.register("saveAddress")}
          />
          Save this address for future orders
        </label>
      )}

      <fieldset className="grid gap-3 pt-4 border-t border-[#efe8e4]">
        <legend className="text-lg font-bold text-[#23403d] mb-2">Payment Method</legend>
        <label className="flex items-center gap-3 text-sm font-bold text-[#23403d] cursor-pointer">
          <input type="radio" value="PREPAID" className="size-4 accent-[#ec6e55]" {...form.register("paymentMode")} />
          Pay online (Razorpay — UPI, Cards, Wallets)
        </label>
        {isCodEnabled ? (
          <label className="flex items-center gap-3 text-sm font-bold text-[#23403d] cursor-pointer">
            <input type="radio" value="COD" className="size-4 accent-[#ec6e55]" {...form.register("paymentMode")} />
            Cash on Delivery
          </label>
        ) : (
          <p className="text-xs font-bold text-[#767676]">COD is currently disabled by store settings.</p>
        )}
      </fieldset>

      <div className="grid gap-1.5 border-t border-[#efe8e4] pt-4">
        <label className="text-sm font-bold text-[#23403d]" htmlFor="notes">
          Order Notes <span className="font-normal text-[#767676]">(optional)</span>
        </label>
        <textarea
          id="notes"
          className="min-h-20 w-full rounded-[20px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          placeholder="Special delivery instructions, etc."
          {...form.register("notes")}
        />
      </div>

      <div className="grid gap-2 border-t border-[#efe8e4] pt-4">
        <h3 className="text-lg font-bold text-[#23403d]">Order summary</h3>
        <div className="flex justify-between text-sm text-[#767676]">
          <span>Subtotal</span>
          <span>{formatPrice(cartSubtotal)}</span>
        </div>
        {cartDiscount > 0 ? (
          <div className="flex justify-between text-sm text-[#767676]">
            <span>Discount</span>
            <span>-{formatPrice(cartDiscount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-sm text-[#767676]">
          <span>Shipping</span>
          <span>
            {shippingQuoteLoading
              ? "Calculating…"
              : shippingQuoteError
                ? "Unavailable"
                : pincode?.length === 6
                  ? hasShippingQuote
                    ? shippingCharge === 0
                      ? "Free"
                      : formatPrice(shippingCharge)
                    : "Enter pincode"
                  : "Enter pincode"}
          </span>
        </div>
        {shippingQuoteError ? (
          <p className="text-xs text-red-600">{shippingQuoteError}</p>
        ) : null}
        {shippingQuote && shippingQuote.estimatedDays > 0 ? (
          <p className="text-xs text-[#767676]">
            Estimated delivery in {shippingQuote.estimatedDays} day
            {shippingQuote.estimatedDays === 1 ? "" : "s"}
          </p>
        ) : null}
        <div className="flex justify-between border-t border-[#efe8e4] pt-2 text-sm font-bold text-[#23403d]">
          <span>{hasShippingQuote ? "Estimated total" : "Cart total"}</span>
          <span>{formatPrice(estimatedPayableTotal)}</span>
        </div>
        <p className="text-xs text-[#767676]">
          {hasShippingQuote
            ? "Final total is confirmed when your order is placed."
            : "Enter a valid pincode to preview shipping."}
        </p>
      </div>

      <button
        type="submit"
        className="mt-2 h-12 w-full rounded-full bg-[#23403d] text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:h-14"
        disabled={submitting || checkoutBlocked}
      >
        {submitting
          ? "Processing…"
          : !configAvailable
            ? "Store settings unavailable"
            : belowMinOrder
              ? "Minimum order not met"
              : "Place Order"}
      </button>

      {error ? (
        <div className="rounded-[10px] bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
          {error.includes("order history") && (
            <Link href="/orders" className="ml-2 underline">Go to orders</Link>
          )}
        </div>
      ) : null}
    </form>
  );
}
