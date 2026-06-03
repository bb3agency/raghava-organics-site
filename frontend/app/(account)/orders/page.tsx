"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { getMyOrders, type UserOrder } from "@/lib/users-api";
import { getBrowserApiBaseUrl } from "@/lib/api-base";
import { getApiErrorMessage } from "@/lib/error-messages";
import { formatPrice } from "@/lib/format-price";
import { EmptyState } from "@/components/shared/EmptyState";

export default function AccountOrdersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        return;
      }
      try {
        const data = await getMyOrders(accessToken);
        if (!cancelled) {
          setOrders(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!orders.length && !error) {
    return (
      <EmptyState
        title="No orders yet"
        description="Your placed orders will appear here."
      />
    );
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h1 className="font-heading text-2xl font-semibold">Order history</h1>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {orders.map((order) => (
        <article
          key={order.id}
          className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_auto]"
        >
          <div>
            <p className="font-medium">{order.orderNumber}</p>
            <p className="text-sm text-muted-foreground">
              {order.status} · {order.paymentMode}
            </p>
            <p className="text-sm">{formatPrice(order.total)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/orders/${order.id}`} className="text-sm underline">
              View
            </Link>
            {order.invoice?.hasPdf ? (
              <a
                href={`${getBrowserApiBaseUrl()}/orders/${order.id}/invoice.pdf`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Invoice
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
