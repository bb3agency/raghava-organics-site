"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCartStore } from "@/stores/cart";
import { useAuthStore } from "@/stores/auth";
import { useCartSync } from "@/hooks/use-cart-sync";
import { formatPrice } from "@/lib/format-price";
import { ShoppingCart, Plus, Minus, X, Trash2, ArrowRight, AlertTriangle } from "lucide-react";
import { clearCart, removeCartItem, updateCartItem, applyCartCoupon, removeCartCoupon } from "@/lib/cart-api";
import { getApiErrorMessage, getApiErrorMessageWithHint } from "@/lib/error-messages";
import { CartLineProductDetails } from "@/components/cart/CartLineProductDetails";
import { getCartLineImageAlt, getCartLineImageUrl, getCartLineProductName } from "@/lib/cart-line-display";
import { useStoreConfig } from "@/components/providers/StoreConfigProvider";
import { formatAppliedCouponLabel } from "@/lib/coupon-display";

export function CartWorkspace() {
  const { couponsEnabled, minOrderValuePaise, configAvailable } = useStoreConfig();
  useCartSync({ resyncKey: couponsEnabled });
  const cart = useCartStore((s) => s.cart);
  const items = useCartStore((s) => s.items);
  const setCart = useCartStore((s) => s.setCart);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [error, setError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  const summary = useMemo(() => {
    if (!cart) {
      return {
        subtotal: 0,
        discountAmount: 0,
        total: 0,
      };
    }
    const subtotal = cart.subtotal;
    const discountAmount = couponsEnabled ? cart.discountAmount : 0;
    return {
      subtotal,
      discountAmount,
      total: couponsEnabled ? cart.total : Math.max(subtotal - discountAmount, 0),
    };
  }, [cart, couponsEnabled]);

  const effectiveMinOrderPaise = cart?.minOrderValuePaise ?? minOrderValuePaise;
  const meetsMinimumOrder =
    cart?.meetsMinimumOrder ??
    (effectiveMinOrderPaise === 0 || summary.subtotal >= effectiveMinOrderPaise);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[20px] bg-white px-4 py-24 text-center shadow-sm">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff5ee]">
          <ShoppingCart className="size-10 text-[#ec6e55]" aria-hidden />
        </div>
        <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">
          Your cart is currently empty.
        </h2>
        <p className="mb-8 text-sm font-medium text-[#767676] max-w-md">
          Before proceed to checkout you must add some products to your shopping cart.
          You will find a lot of interesting products on our &quot;Shop&quot; page.
        </p>
        <Link
          href="/products"
          className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  const handleQuantity = async (itemId: string, quantity: number) => {
    try {
      setError(null);
      setLoadingItemId(itemId);
      const next = await updateCartItem(itemId, { quantity }, accessToken);
      setCart(next);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      setError(null);
      setLoadingItemId(itemId);
      const next = await removeCartItem(itemId, accessToken);
      setCart(next);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleClear = async () => {
    try {
      setError(null);
      const next = await clearCart(accessToken);
      setCart(next);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponsEnabled) {
      setError("Coupons are not available right now.");
      return;
    }
    const trimmed = couponCode.trim();
    if (!trimmed) return;
    try {
      setError(null);
      setCouponLoading(true);
      const next = await applyCartCoupon(trimmed, accessToken);
      setCart(next);
      setCouponCode("");
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      setError(null);
      setCouponLoading(true);
      const next = await removeCartCoupon(accessToken);
      setCart(next);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setCouponLoading(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[65%_35%] lg:items-start">
      
      {/* ── Cart Items List ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <div className="rounded-[20px] bg-white shadow-sm overflow-hidden">
          {/* Desktop Table Header */}
          <div className="hidden grid-cols-[3fr_1fr_1.5fr_1fr_auto] items-center gap-4 bg-[#faf3ef] px-6 py-4 text-sm font-bold uppercase tracking-wider text-[#23403d] md:grid">
            <div>Product</div>
            <div className="text-center">Price</div>
            <div className="text-center">Quantity</div>
            <div className="text-right">Subtotal</div>
            <div className="w-8"></div>
          </div>

          <div className="flex flex-col divide-y divide-[#efe8e4]">
            {items.map((item) => {
              const productName = getCartLineProductName(item);
              const isLoading = loadingItemId === item.id;
              return (
                <article
                  key={item.id}
                  className={`grid grid-cols-1 gap-3 p-4 transition-opacity sm:gap-4 sm:p-6 md:grid-cols-[3fr_1fr_1.5fr_1fr_auto] md:items-center ${isLoading ? "opacity-50" : ""}`}
                >
                  {/* Product Info */}
                  <div className="flex items-center gap-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[12px] bg-[#faf3ef] shadow-sm sm:size-20">
                      <Image
                        src={getCartLineImageUrl(item)}
                        alt={getCartLineImageAlt(item)}
                        fill
                        className="object-contain p-2"
                        sizes="80px"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <CartLineProductDetails item={item} />
                      {/* Mobile Only Price */}
                      <div className="mt-2 text-sm font-bold text-[#ec6e55] md:hidden">
                        {formatPrice(item.variant.price)} each
                      </div>
                    </div>
                  </div>

                  {/* Desktop Price */}
                  <div className="hidden text-center text-sm font-bold text-[#ec6e55] md:block">
                    {formatPrice(item.variant.price)}
                  </div>

                  {/* Quantity Control */}
                  <div className="flex items-center justify-start gap-3 md:justify-center">
                    <div className="flex h-10 items-center rounded-full border border-[#efe8e4] bg-[#faf3ef] px-1.5 sm:h-11 sm:px-2">
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full text-[#767676] transition-all hover:bg-white hover:text-[#23403d] hover:shadow-sm disabled:opacity-40 sm:size-8"
                        onClick={() => handleQuantity(item.id, Math.max(1, item.quantity - 1))}
                        disabled={isLoading || item.quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-[#23403d]">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full text-[#767676] transition-all hover:bg-white hover:text-[#23403d] hover:shadow-sm disabled:opacity-40 sm:size-8"
                        onClick={() => handleQuantity(item.id, item.quantity + 1)}
                        disabled={isLoading}
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="flex items-center justify-between font-bold text-[#23403d] md:block md:text-right">
                    <span className="text-xs text-[#767676] md:hidden">Subtotal:</span>
                    <span className="text-sm">{formatPrice(item.lineTotal)}</span>
                  </div>

                  {/* Remove */}
                  <div className="flex justify-end md:block">
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-full bg-[#faf3ef] text-[#767676] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      onClick={() => handleRemove(item.id)}
                      disabled={isLoading}
                      aria-label={`Remove ${productName}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="rounded-[20px] bg-red-50 p-4 text-sm font-bold text-red-600">
            {error}
          </div>
        ) : null}

        {/* Cart Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/products"
            className="inline-flex h-11 items-center justify-center rounded-full border-2 border-[#efe8e4] bg-white px-5 text-xs font-bold text-[#23403d] transition-colors hover:border-[#23403d] hover:bg-[#23403d] hover:text-white sm:h-12 sm:px-8 sm:text-sm"
          >
            Continue Shopping
          </Link>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#faf3ef] px-5 text-xs font-bold text-[#ec6e55] transition-colors hover:bg-red-50 hover:text-red-600 sm:h-12 sm:px-6 sm:text-sm"
            onClick={handleClear}
          >
            <Trash2 className="size-4" /> Clear Cart
          </button>
        </div>
      </section>

      {/* ── Order Summary Sidebar ────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-6">
        <div className="rounded-[20px] bg-white p-6 shadow-sm lg:p-8">
          <h2 className="mb-6 font-heading text-2xl font-bold text-[#23403d]">Cart Totals</h2>

          <div className="flex flex-col gap-4 text-sm font-bold">
            {couponsEnabled ? (
              <div className="flex flex-col gap-2 border-b border-[#efe8e4] pb-4">
                {cart?.coupon ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#767676]">
                      <span className="font-bold text-[#23403d]">
                        {formatAppliedCouponLabel(cart.coupon) ?? "Coupon applied"}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={couponLoading}
                      onClick={handleRemoveCoupon}
                      className="text-xs font-bold text-[#ec6e55] hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      className="h-10 flex-1 rounded-full border border-[#efe8e4] px-4 text-xs font-bold uppercase text-[#23403d] outline-none focus:border-[#23403d]"
                    />
                    <button
                      type="button"
                      disabled={couponLoading || couponCode.trim().length === 0}
                      onClick={handleApplyCoupon}
                      className="h-10 rounded-full bg-[#23403d] px-5 text-xs font-bold text-white transition-colors hover:bg-[#ec6e55] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-between border-b border-[#efe8e4] pb-4">
              <span className="text-[#767676]">Subtotal</span>
              <span className="text-[#23403d]">{formatPrice(summary.subtotal)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#efe8e4] pb-4">
              <span className="text-[#767676]">Discount</span>
              <span className="text-[#00aa63]">
                {summary.discountAmount > 0
                  ? `-${formatPrice(summary.discountAmount)}`
                  : formatPrice(0)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-lg text-[#23403d]">Total</span>
              <span className="text-2xl text-[#ec6e55]">{formatPrice(summary.total)}</span>
            </div>

            {/* Minimum order indicator */}
            {effectiveMinOrderPaise > 0 && (
              <div className="flex items-center justify-between border-t border-[#efe8e4] pt-3">
                <span className="text-xs text-[#767676]">Minimum order</span>
                <span className="text-xs font-bold text-[#23403d]">
                  {formatPrice(effectiveMinOrderPaise)}
                </span>
              </div>
            )}
          </div>

          {/* Min-order / config gate */}
          {!configAvailable ? (
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <p className="text-xs font-bold text-amber-800">
                  Store settings are temporarily unavailable. Refresh the page before checkout.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[#23403d]/30 text-sm font-bold text-white sm:h-14"
              >
                Proceed to checkout <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : !meetsMinimumOrder && effectiveMinOrderPaise > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <p className="text-xs font-bold text-amber-800">
                  Add {formatPrice(effectiveMinOrderPaise - summary.subtotal)} more to reach the{" "}
                  {formatPrice(effectiveMinOrderPaise)} minimum order value.
                </p>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[#23403d]/30 text-sm font-bold text-white sm:h-14"
              >
                Proceed to checkout <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="mt-8">
              <Link
                href={accessToken ? "/checkout" : "/login?redirect=/checkout"}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#23403d] text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg sm:h-14"
              >
                Proceed to checkout <ArrowRight className="size-4" />
              </Link>
            </div>
          )}

          <p className="mt-4 text-center text-xs font-bold text-[#767676]">
            Shipping & taxes calculated at checkout.
          </p>
        </div>
      </aside>
      
    </div>
  );
}
