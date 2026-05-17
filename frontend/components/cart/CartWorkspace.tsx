"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCartStore } from "@/stores/cart";
import { useAuthStore } from "@/stores/auth";
import { useCartSync } from "@/hooks/use-cart-sync";
import { formatPrice } from "@/lib/format-price";
import { EmptyState } from "@/components/shared/EmptyState";
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
      <EmptyState
        title="Your cart is empty"
        description="Add products from catalogue to begin checkout."
      />
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
    <div className="grid gap-6 lg:grid-cols-[65%_35%]">
      <section className="grid gap-3 rounded-lg border border-border p-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border pb-3 last:border-b-0"
          >
            <div>
              <p className="font-medium">{item.variant.name}</p>
              <p className="text-sm text-muted-foreground">SKU: {item.variant.sku}</p>
            </div>
            <div className="text-right">
              <p className="text-sm">Qty {item.quantity}</p>
              <p className="font-medium">{formatPrice(item.lineTotal)}</p>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs"
                  onClick={() => handleQuantity(item.id, Math.max(1, item.quantity - 1))}
                  disabled={loadingItemId === item.id}
                >
                  -
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs"
                  onClick={() => handleQuantity(item.id, item.quantity + 1)}
                  disabled={loadingItemId === item.id}
                >
                  +
                </button>
                <button
                  type="button"
                  className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive"
                  onClick={() => handleRemove(item.id)}
                  disabled={loadingItemId === item.id}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="justify-self-start rounded border border-border px-3 py-2 text-sm"
          onClick={handleClear}
        >
          Clear cart
        </button>
      </section>

      <aside className="grid h-max gap-2 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Order summary</h2>
        <p className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatPrice(summary.subtotal)}</span>
        </p>
        <p className="flex justify-between text-sm">
          <span>Discount</span>
          <span>-{formatPrice(summary.discountAmount)}</span>
        </p>
        <p className="flex justify-between border-t border-border pt-2 font-medium">
          <span>Total</span>
          <span>{formatPrice(summary.total)}</span>
        </p>
        <Link
          href="/checkout"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground"
        >
          Proceed to checkout
        </Link>
      </aside>
    </div>
  );
}
