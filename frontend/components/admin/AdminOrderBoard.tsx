"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import {
  ORDER_BOARD_COLUMNS,
  type AdminBoardOrderItem,
  type AdminOrderBoard,
  type OrderBoardColumnKey,
} from "@/lib/admin-api";
import { formatAdminDate, formatPaise, orderStatusTone } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

const COLUMN_LABELS: Record<OrderBoardColumnKey, string> = {
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function AdminOrderBoard() {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<AdminOrderBoard | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminOrderBoard>("/admin/orders/board");
      setBoard(response);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(getApiErrorMessage(err));
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalOrders = board
    ? ORDER_BOARD_COLUMNS.reduce(
        (sum, key) => sum + (board.columns[key]?.length ?? 0),
        0,
      )
    : 0;

  return (
    <AdminSection
      title="Order board"
      description={
        loadedAt
          ? `Fulfillment pipeline · updated ${formatAdminDate(loadedAt)}`
          : "Fulfillment pipeline by order status."
      }
      loading={loading}
      error={error}
      empty={!loading && !error && totalOrders === 0}
      emptyMessage="No orders on the board."
      actions={
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      }
    >
      {board ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {ORDER_BOARD_COLUMNS.map((columnKey) => (
            <BoardColumn
              key={columnKey}
              label={COLUMN_LABELS[columnKey]}
              orders={board.columns[columnKey] ?? []}
            />
          ))}
        </div>
      ) : null}
    </AdminSection>
  );
}

function BoardColumn({
  label,
  orders,
}: {
  label: string;
  orders: AdminBoardOrderItem[];
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/20">
      <header className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">
          {label}{" "}
          <span className="text-muted-foreground">({orders.length})</span>
        </h3>
      </header>
      <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto p-2">
        {orders.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">Empty</li>
        ) : (
          orders.map((order) => (
            <li
              key={order.id}
              className="rounded-md border border-border bg-card p-3 text-sm shadow-sm"
            >
              <Link
                href={`/admin/orders/${order.id}`}
                className="font-medium text-primary hover:underline"
              >
                {order.orderNumber}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">{order.customerName}</p>
              <p className="mt-1 font-medium">{formatPaise(order.total)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <AdminStatusBadge
                  label={order.status}
                  tone={orderStatusTone(order.status)}
                />
                <AdminStatusBadge label={order.paymentMode} tone="default" />
              </div>
              {order.canShipNow ? (
                <p className="mt-2 text-xs text-emerald-600">Ready to ship</p>
              ) : order.shipBlockReason ? (
                <p className="mt-2 text-xs text-amber-600">{order.shipBlockReason}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
