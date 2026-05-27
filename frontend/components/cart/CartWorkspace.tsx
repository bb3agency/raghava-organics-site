"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCartStore } from "@/stores/cart";
import { useAuthStore } from "@/stores/auth";
import { useCartSync } from "@/hooks/use-cart-sync";
import { formatPrice } from "@/lib/format-price";
import { ShoppingCart, Plus, Minus, X, Trash2, ArrowRight } from "lucide-react";
import { clearCart, removeCartItem, updateCartItem } from "@/lib/cart-api";
import { getApiErrorMessage } from "@/lib/error-messages";

export function CartWorkspace() {
  useCartSync();
  const cart = useCartStore((s) => s.cart);
  const items = useCartStore((s) => s.items);
  const setCart = useCartStore((s) => s.setCart);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [error, setError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!cart) {
      return {
        subtotal: 0,
        discountAmount: 0,
        total: 0,
      };
    }
    return {
      subtotal: cart.subtotal,
      discountAmount: cart.discountAmount,
      total: cart.total,
    };
  }, [cart]);

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
            {items.map((item) => (
              <article
                key={item.id}
                className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[3fr_1fr_1.5fr_1fr_auto] md:items-center"
              >
                {/* Product Info */}
                <div className="flex items-center gap-4">
                  {/* Fake Image block for spacing, since backend CartItem doesn't return an image right now, we use a placeholder */}
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-[10px] bg-[#faf3ef]">
                    <span className="text-2xl">🛍️</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-[#23403d]">
                      {item.variant.name}
                    </span>
                    <p className="mt-1 text-xs font-bold text-[#767676]">SKU: {item.variant.sku}</p>
                    
                    {/* Mobile Only Price */}
                    <div className="mt-2 font-bold text-[#ec6e55] md:hidden">
                      {formatPrice(item.variant.price)}
                    </div>
                  </div>
                </div>

                {/* Desktop Price */}
                <div className="hidden text-center font-bold text-[#ec6e55] md:block">
                  {formatPrice(item.variant.price)}
                </div>

                {/* Quantity Control */}
                <div className="flex items-center justify-start md:justify-center">
                  <div className="flex h-11 items-center rounded-full border border-[#efe8e4] bg-[#faf3ef] px-2">
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-full text-[#767676] hover:bg-white hover:text-[#23403d] hover:shadow-sm transition-all disabled:opacity-50"
                      onClick={() => handleQuantity(item.id, Math.max(1, item.quantity - 1))}
                      disabled={loadingItemId === item.id}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-[#23403d]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-full text-[#767676] hover:bg-white hover:text-[#23403d] hover:shadow-sm transition-all disabled:opacity-50"
                      onClick={() => handleQuantity(item.id, item.quantity + 1)}
                      disabled={loadingItemId === item.id}
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between font-bold text-[#23403d] md:block md:text-right">
                  <span className="text-sm text-[#767676] md:hidden">Subtotal:</span>
                  <span>{formatPrice(item.lineTotal)}</span>
                </div>

                {/* Remove */}
                <div className="flex justify-end md:block">
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-full bg-[#faf3ef] text-[#767676] hover:bg-[#ec6e55] hover:text-white transition-colors disabled:opacity-50"
                    onClick={() => handleRemove(item.id)}
                    disabled={loadingItemId === item.id}
                    aria-label="Remove item"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </article>
            ))}
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
            className="inline-flex h-12 items-center justify-center rounded-full border-2 border-[#efe8e4] bg-white px-8 text-sm font-bold text-[#23403d] transition-colors hover:border-[#23403d] hover:bg-[#23403d] hover:text-white"
          >
            Continue Shopping
          </Link>
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#faf3ef] px-6 text-sm font-bold text-[#ec6e55] transition-colors hover:bg-red-50 hover:text-red-600"
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
            <div className="flex items-center justify-between border-b border-[#efe8e4] pb-4">
              <span className="text-[#767676]">Subtotal</span>
              <span className="text-[#23403d]">{formatPrice(summary.subtotal)}</span>
            </div>
            
            <div className="flex items-center justify-between border-b border-[#efe8e4] pb-4">
              <span className="text-[#767676]">Discount</span>
              <span className="text-[#00aa63]">-{formatPrice(summary.discountAmount)}</span>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <span className="text-lg text-[#23403d]">Total</span>
              <span className="text-2xl text-[#ec6e55]">{formatPrice(summary.total)}</span>
            </div>
          </div>

          <div className="mt-8">
            <Link
              href="/checkout"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#23403d] text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg"
            >
              Proceed to checkout <ArrowRight className="size-4" />
            </Link>
          </div>
          
          <p className="mt-4 text-center text-xs font-bold text-[#767676]">
            Shipping & taxes calculated at checkout.
          </p>
        </div>
      </aside>
      
    </div>
  );
}
