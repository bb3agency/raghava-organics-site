"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import {
  ensureArray,
  type AdminOrderDetailFull,
  type AdminOrderLineItem,
} from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";

const EDITABLE_STATUSES = new Set(["PENDING_PAYMENT", "CONFIRMED"]);

interface AdminOrderItemsPanelProps {
  orderId: string;
  onUpdated?: () => void;
}

export function AdminOrderItemsPanel({ orderId, onUpdated }: AdminOrderItemsPanelProps) {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.ordersWrite);

  const [order, setOrder] = useState<AdminOrderDetailFull | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api<AdminOrderDetailFull>(`/admin/orders/${orderId}`);
      const normalized = {
        ...detail,
        items: ensureArray<AdminOrderLineItem>(detail.items),
      };
      setOrder(normalized);
      const next: Record<string, string> = {};
      for (const item of normalized.items) {
        next[item.id] = String(item.quantity);
      }
      setQuantities(next);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEditItems = order ? EDITABLE_STATUSES.has(order.status) : false;

  async function saveItems() {
    if (!canWrite || !order || !canEditItems) return;
    const updates = order.items
      .map((item) => {
        const quantity = Number(quantities[item.id]);
        if (!Number.isFinite(quantity) || quantity < 1) return null;
        if (quantity === item.quantity) return null;
        return { orderItemId: item.id, quantity: Math.round(quantity) };
      })
      .filter((update): update is { orderItemId: string; quantity: number } => update !== null);

    if (updates.length === 0) {
      setError("Change at least one line item quantity before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api(`/admin/orders/${orderId}/items`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ updates }),
      });
      setSuccess("Line items updated.");
      await load();
      onUpdated?.();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!canWrite) return null;

  return (
    <AdminSection
      title="Adjust line items"
      description={
        canEditItems
          ? "Quantity changes allowed while order is PENDING_PAYMENT or CONFIRMED."
          : "Line items are read-only for this order status."
      }
      loading={loading}
      error={error}
      empty={!loading && !order}
      emptyMessage="No line items."
    >
      {order ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.variantName}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                    <td className="px-3 py-2">
                      {canEditItems ? (
                        <input
                          className="h-8 w-20 rounded-md border border-border px-2 text-sm"
                          value={quantities[item.id] ?? ""}
                          onChange={(event) =>
                            setQuantities({ ...quantities, [item.id]: event.target.value })
                          }
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-3 py-2">{formatPaise(item.unitPrice)}</td>
                    <td className="px-3 py-2">{formatPaise(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEditItems ? (
            <button
              type="button"
              disabled={saving}
              className="mt-3 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              onClick={() => void saveItems()}
            >
              {saving ? "Saving…" : "Save quantity changes"}
            </button>
          ) : null}
          {success ? <p className="mt-2 text-sm text-emerald-600">{success}</p> : null}
        </>
      ) : null}
    </AdminSection>
  );
}
