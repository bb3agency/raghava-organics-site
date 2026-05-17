"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getMyOrder } from "@/lib/orders-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { formatPrice } from "@/lib/format-price";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentMode: "PREPAID" | "COD";
  subtotal: number;
  shippingCharge: number;
  discountAmount: number;
  total: number;
}

export default function AccountOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !params.id) {
        return;
      }
      try {
        const result = await getMyOrder(params.id, accessToken);
        if (!cancelled) {
          setOrder(result as OrderDetail);
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
  }, [accessToken, params.id]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!order) {
    return <p className="text-sm text-muted-foreground">Loading order...</p>;
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h1 className="font-heading text-2xl font-semibold">{order.orderNumber}</h1>
      <p className="text-sm text-muted-foreground">
        {order.status} · {order.paymentMode}
      </p>
      <p className="flex justify-between text-sm">
        <span>Subtotal</span>
        <span>{formatPrice(order.subtotal)}</span>
      </p>
      <p className="flex justify-between text-sm">
        <span>Shipping</span>
        <span>{formatPrice(order.shippingCharge)}</span>
      </p>
      <p className="flex justify-between text-sm">
        <span>Discount</span>
        <span>-{formatPrice(order.discountAmount)}</span>
      </p>
      <p className="flex justify-between border-t border-border pt-2 font-medium">
        <span>Total</span>
        <span>{formatPrice(order.total)}</span>
      </p>
    </section>
  );
}
