"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useSafeRouter } from "@/lib/use-safe-router";
import { MapPin, AlertTriangle, ShoppingBag, Truck, Tag } from "lucide-react";
import { checkPincodeServiceability, getDeliveryRates, applyCartCoupon, removeCartCoupon } from "@/lib/cart-api";
import { getApiErrorMessage, getApiErrorMessageWithHint } from "@/lib/error-messages";
import { ApiError } from "@/lib/api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { createMyAddress, getMyAddresses, type UserAddress } from "@/lib/users-api";
import { createOrder, prepareCheckout, confirmPrepaid } from "@/lib/orders-api";
import { formatPrice } from "@/lib/format-price";
import { CartLineProductDetails } from "@/components/cart/CartLineProductDetails";
import { useCartSync } from "@/hooks/use-cart-sync";
import { getCartLineImageAlt, getCartLineImageUrl } from "@/lib/cart-line-display";
import { useStoreConfig } from "@/components/providers/StoreConfigProvider";
import { formatAppliedCouponLabel, isFreeShippingCoupon } from "@/lib/coupon-display";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
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

export function CheckoutForm() {
  const router = useSafeRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingQuote, setShippingQuote] = useState<{ shippingCharge: number; estimatedDays: number } | null>(null);
  const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
  const [shippingQuoteError, setShippingQuoteError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const { couponsEnabled, isCodEnabled, minOrderValuePaise, configAvailable } = useStoreConfig();
  useCartSync({ resyncKey: couponsEnabled });
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore((s) => s.cart);
  const setCart = useCartStore((s) => s.setCart);
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

  const pincode = useWatch({ control: form.control, name: "pincode" });
  const paymentMode = useWatch({ control: form.control, name: "paymentMode" });

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
          const isProviderError =
            err instanceof ApiError &&
            (err.code === "CONFIG_NOT_READY" || err.code === "INTERNAL_ERROR");
          setShippingQuoteError(
            isProviderError
              ? "Delivery estimate is temporarily unavailable. COD is still available, or contact us for assistance."
              : getApiErrorMessageWithHint(err),
          );
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
  }, [accessToken, pincode, paymentMode, cart?.coupon?.id]);

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

  const handleApplyCoupon = async () => {
    if (!couponsEnabled) {
      setCouponError("Coupons are not available right now.");
      return;
    }
    if (!couponCode.trim()) {
      setCouponError("Please enter a coupon code.");
      return;
    }
    setCouponLoading(true);
    setCouponError(null);
    try {
      const next = await applyCartCoupon(couponCode, accessToken);
      setCart(next);
      setCouponCode("");
    } catch (err) {
      setCouponError(getApiErrorMessageWithHint(err));
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponLoading(true);
    setCouponError(null);
    try {
      const next = await removeCartCoupon(accessToken);
      setCart(next);
    } catch (err) {
      setCouponError(getApiErrorMessage(err));
    } finally {
      setCouponLoading(false);
    }
  };

  if (!accessToken) {
    return (
      <div className="rounded-[20px] bg-white p-8 shadow-sm text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-[#eff5ee]">
            <ShoppingBag className="size-8 text-[#23403d]" aria-hidden />
          </div>
        </div>
        <p className="mb-6 text-sm font-medium text-[#767676]">
          Please sign in to place an order.
        </p>
        <Link
          href="/login?redirect=/checkout"
          className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-colors hover:bg-[#ec6e55]"
        >
          Sign in to continue
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
  const cartDiscount = couponsEnabled ? (cart?.discountAmount ?? 0) : 0;
  const hasAppliedCoupon = couponsEnabled && Boolean(cart?.coupon);
  const appliedCouponLabel = formatAppliedCouponLabel(couponsEnabled ? cart?.coupon : null);
  const freeShippingCouponApplied = couponsEnabled && isFreeShippingCoupon(cart?.coupon);
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

      // COD: create order directly (order confirmed immediately)
      if (values.paymentMode === "COD") {
        const orderIdempotencyKey = createIdempotencyKey();
        const order = await createOrder(
          addressId
            ? { addressId, paymentMode: "COD", notes: values.notes }
            : {
                paymentMode: "COD",
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
        clearPendingMerge();
        clearCart();
        router.push(`/checkout/success?orderId=${order.id}`);
        return;
      }

      // PREPAID: prepare checkout session (no DB order yet)
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

      const prepareKey = createIdempotencyKey();
      const checkout = await prepareCheckout(
        addressId
          ? { addressId, notes: values.notes }
          : {
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
        prepareKey,
      );

      const confirmKey = createIdempotencyKey();
      const razorpay = new window.Razorpay({
        key: razorpayKey,
        amount: checkout.amount,
        currency: checkout.currency,
        order_id: checkout.razorpayOrderId,
        name: process.env.NEXT_PUBLIC_STORE_NAME ?? "Raghava Organics",
        description: "Complete your order",
        prefill: {
          name: values.fullName,
          contact: values.phone,
          ...(user?.email ? { email: user.email } : {}),
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const confirmedOrder = await confirmPrepaid(
              {
                checkoutSessionId: checkout.checkoutSessionId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              accessToken,
              confirmKey,
            );
            clearPendingMerge();
            clearCart();
            router.push(`/checkout/success?orderId=${confirmedOrder.id}`);
          } catch (confirmError) {
            setError(getApiErrorMessage(confirmError));
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
      });

      razorpay.on("payment.failed", (response: Record<string, unknown>) => {
        const err = response.error as Record<string, unknown> | undefined;
        const isCancelled =
          (err?.reason as string | undefined) === "cancelled" ||
          (err?.source as string) === "customer";
        setSubmitting(false);
        setError(
          isCancelled
            ? "Payment was cancelled. Please try again when ready."
            : `Payment failed: ${(err?.description as string | undefined) ?? "Please try again or use a different payment method."}`,
        );
      });

      razorpay.open();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setError(getApiErrorMessageWithHint(err));
      } else if (
        err instanceof ApiError &&
        (err.code === "CONFIG_NOT_READY" || err.code === "INTERNAL_ERROR")
      ) {
        setError(
          "Our payment or delivery service is temporarily unavailable. Please try COD, or contact us to complete your order.",
        );
      } else {
        setError(getApiErrorMessage(err));
      }
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-6 rounded-[20px] bg-white p-4 shadow-sm sm:p-6 lg:p-8">
      <h2 className="font-heading text-xl font-bold text-[#23403d]">Shipping Details</h2>

      {/* ── Saved Addresses ───────────────────────────────────────────── */}
      {savedAddresses.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[#767676]">
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

      {/* ── Cart Item Cards ───────────────────────────────────────────── */}
      {cartItems.length > 0 && (
        <div className="rounded-[16px] border border-[#efe8e4] bg-[#faf3ef] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[#efe8e4] bg-white px-4 py-3">
            <ShoppingBag className="size-4 text-[#23403d]" aria-hidden />
            <span className="text-sm font-bold text-[#23403d]">
              Your items ({cartItems.length})
            </span>
          </div>

          <div className="divide-y divide-[#efe8e4]">
            {cartItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Thumbnail */}
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-[8px] bg-white shadow-sm">
                    <Image
                      src={getCartLineImageUrl(item)}
                      alt={getCartLineImageAlt(item)}
                      fill
                      className="object-contain p-1.5"
                      sizes="48px"
                    />
                    {/* Quantity badge */}
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[#23403d] text-[10px] font-bold text-white">
                      {item.quantity}
                    </span>
                  </div>

                  {/* Product name + short description */}
                  <div className="min-w-0 flex-1">
                    <CartLineProductDetails
                      item={item}
                      nameClassName="truncate text-xs font-bold text-[#23403d] sm:text-sm"
                      descriptionClassName="text-[10px] text-[#767676] line-clamp-2"
                    />
                  </div>

                  {/* Line total */}
                  <span className="shrink-0 text-sm font-bold text-[#ec6e55]">
                    {formatPrice(item.priceSnapshot * item.quantity)}
                  </span>
                </div>
            ))}
          </div>

          {/* Mini totals */}
          <div className="border-t border-[#efe8e4] bg-white px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-xs text-[#767676]">
              <span>Subtotal</span>
              <span className="font-medium">{formatPrice(cartSubtotal)}</span>
            </div>
            {cartDiscount > 0 && (
              <div className="flex items-center justify-between text-xs text-[#00aa63]">
                <span className="flex items-center gap-1">
                  <Tag className="size-3" aria-hidden /> Discount
                </span>
                <span className="font-bold">−{formatPrice(cartDiscount)}</span>
              </div>
            )}
            {freeShippingCouponApplied && cartDiscount === 0 && (
              <div className="flex items-center justify-between text-xs text-[#00aa63]">
                <span className="flex items-center gap-1">
                  <Tag className="size-3" aria-hidden /> Coupon
                </span>
                <span className="font-bold">Free shipping</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#efe8e4] pt-1.5 text-sm font-bold text-[#23403d]">
              <span>Total</span>
              <span>{formatPrice(cartPayableTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts ───────────────────────────────────────────────────── */}
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

      {/* ── Address Fields ────────────────────────────────────────────── */}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#23403d]">
          <input
            type="checkbox"
            className="size-4 accent-[#ec6e55]"
            {...form.register("saveAddress")}
          />
          Save this address for future orders
        </label>
      )}

      {/* ── Payment Method ────────────────────────────────────────────── */}
      <fieldset className="grid gap-3 border-t border-[#efe8e4] pt-5">
        <legend className="text-lg font-bold text-[#23403d] mb-1">Payment Method</legend>
        <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm font-bold text-[#23403d] transition-colors has-[:checked]:border-[#23403d] has-[:checked]:bg-white">
          <input type="radio" value="PREPAID" className="size-4 accent-[#ec6e55]" {...form.register("paymentMode")} />
          <span>Pay online</span>
          <span className="ml-auto text-xs font-medium text-[#767676]">Razorpay — UPI, Cards, Wallets</span>
        </label>
        {isCodEnabled ? (
          <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-sm font-bold text-[#23403d] transition-colors has-[:checked]:border-[#23403d] has-[:checked]:bg-white">
            <input type="radio" value="COD" className="size-4 accent-[#ec6e55]" {...form.register("paymentMode")} />
            <span>Cash on Delivery</span>
            <span className="ml-auto text-xs font-medium text-[#767676]">Pay when delivered</span>
          </label>
        ) : (
          <p className="rounded-[12px] border border-[#efe8e4] bg-[#faf3ef] px-4 py-3 text-xs font-medium text-[#767676]">
            Cash on Delivery is currently disabled by store settings.
          </p>
        )}
      </fieldset>

      {/* ── Order Notes ───────────────────────────────────────────────── */}
      <div className="grid gap-1.5 border-t border-[#efe8e4] pt-5">
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

      {/* ── Coupon Section ────────────────────────────────────────────── */}
      {couponsEnabled ? (
        <div className="grid gap-2.5 rounded-[16px] border border-[#e8ddd5] bg-white p-4">
          <div className="flex items-center gap-2">
            <Tag className="size-4 text-[#23403d]" aria-hidden />
            <h3 className="text-sm font-bold text-[#23403d]">Coupon Code</h3>
          </div>
          {hasAppliedCoupon ? (
            <div className="flex items-center justify-between rounded-[8px] bg-[#eff5ee] px-3 py-2">
              <span className="text-sm font-medium text-[#00aa63]">
                {appliedCouponLabel ?? "Coupon applied"}
              </span>
              <button
                type="button"
                onClick={() => void handleRemoveCoupon()}
                disabled={couponLoading}
                className="text-xs font-semibold text-[#ec6e55] hover:text-[#d95a41] disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponError(null);
                }}
                disabled={couponLoading}
                className="flex-1 rounded-[8px] border border-[#e8ddd5] bg-white px-3 py-2 text-sm font-medium uppercase placeholder-[#999] focus:border-[#23403d] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleApplyCoupon()}
                disabled={couponLoading || !couponCode.trim()}
                className="rounded-[8px] bg-[#23403d] px-4 py-2 text-sm font-bold text-white hover:bg-[#ec6e55] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {couponLoading ? "Applying…" : "Apply"}
              </button>
            </div>
          )}
          {couponError && (
            <p className="text-xs font-medium text-[#ec6e55]">{couponError}</p>
          )}
        </div>
      ) : null}

      {/* ── Order Summary (pre-submit) ─────────────────────────────────── */}
      <div className="grid gap-2.5 rounded-[16px] border border-[#efe8e4] bg-[#faf3ef] p-4">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="size-4 text-[#23403d]" aria-hidden />
          <h3 className="text-sm font-bold text-[#23403d]">Order total</h3>
        </div>
        <div className="flex justify-between text-sm text-[#767676]">
          <span>Subtotal</span>
          <span className="font-medium">{formatPrice(cartSubtotal)}</span>
        </div>
        {cartDiscount > 0 && (
          <div className="flex justify-between text-sm text-[#00aa63]">
            <span>Discount</span>
            <span className="font-bold">−{formatPrice(cartDiscount)}</span>
          </div>
        )}
        {freeShippingCouponApplied && cartDiscount === 0 && (
          <div className="flex justify-between text-sm text-[#00aa63]">
            <span>Coupon</span>
            <span className="font-bold">Free shipping</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-[#767676]">
          <span>Shipping</span>
          <span className={shippingQuoteLoading ? "animate-pulse text-[#767676]" : "font-medium text-[#23403d]"}>
            {shippingQuoteLoading
              ? "Calculating…"
              : shippingQuoteError
                ? "—"
                : pincode?.length === 6
                  ? hasShippingQuote
                    ? shippingCharge === 0
                      ? "Free"
                      : formatPrice(shippingCharge)
                    : "—"
                  : "Enter pincode"}
          </span>
        </div>
        {shippingQuoteError ? (
          <p className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {shippingQuoteError}
          </p>
        ) : null}
        {shippingQuote && shippingQuote.estimatedDays > 0 ? (
          <p className="text-xs text-[#767676]">
            Estimated delivery in {shippingQuote.estimatedDays} day
            {shippingQuote.estimatedDays === 1 ? "" : "s"}
          </p>
        ) : null}
        <div className="flex justify-between border-t border-[#efe8e4] pt-2.5 text-base font-bold text-[#23403d]">
          <span>{hasShippingQuote ? "Estimated total" : "Cart total"}</span>
          <span className="text-[#ec6e55]">{formatPrice(estimatedPayableTotal)}</span>
        </div>
        {!hasShippingQuote && pincode?.length !== 6 && (
          <p className="text-xs text-[#767676]">Enter a valid pincode to preview shipping.</p>
        )}
      </div>

      {/* ── Place Order ───────────────────────────────────────────────── */}
      <button
        type="submit"
        className="h-14 w-full rounded-full bg-[#23403d] text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
          {error.includes("order history") && (
            <Link href="/orders" className="ml-2 font-bold underline">Go to orders</Link>
          )}
        </div>
      ) : null}
    </form>
  );
}
