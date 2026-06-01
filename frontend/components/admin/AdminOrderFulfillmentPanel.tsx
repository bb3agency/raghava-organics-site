"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { getBrowserApiBaseUrl } from "@/lib/api-base";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth";
import type {
  AdminOrderDetail,
  AdminOrdersListResponse,
  AdminPrintLabelResponse,
  AdminSchedulePickupResponse,
} from "@/types/admin-order";

interface AdminOrderFulfillmentPanelProps {
  initialOrderId?: string;
}

function DetailRowItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function codCollectionCopy(
  paymentMode: AdminOrderDetail["paymentMode"],
  paymentStatus: string | null | undefined,
  orderStatus: string,
): string {
  if (paymentMode !== "COD") {
    return "Prepaid orders require Razorpay capture before shipping.";
  }
  if (paymentStatus === "CAPTURED") {
    return "COD recorded after Shiprocket reported delivery (webhook).";
  }
  if (orderStatus === "DELIVERED") {
    return "Delivered — waiting for payment capture from webhook/worker.";
  }
  return "Shiprocket collects cash on delivery; payment is captured when status becomes DELIVERED.";
}

export function AdminOrderFulfillmentPanel({
  initialOrderId,
}: AdminOrderFulfillmentPanelProps) {
  const api = useAuthenticatedApi();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const canRefund = hasAdminPermission(user, ADMIN_PERMISSIONS.ordersRefund);

  const [orders, setOrders] = useState<AdminOrdersListResponse["items"]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId ?? "");
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api<AdminOrdersListResponse>("/admin/orders?page=1&limit=30");
      setOrders(data.items ?? []);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    }
  }, [api]);

  const loadDetail = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setDetail(null);
        return;
      }
      setLoadingDetail(true);
      setError(null);
      try {
        const data = await api<AdminOrderDetail>(`/admin/orders/${orderId}`);
        setDetail(data);
      } catch (err) {
        setDetail(null);
        setError(getApiErrorMessageWithHint(err));
      } finally {
        setLoadingDetail(false);
      }
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOrderList() {
      try {
        const data = await api<AdminOrdersListResponse>("/admin/orders?page=1&limit=30");
        if (!cancelled) {
          setOrders(data.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessageWithHint(err));
        }
      }
    }

    void loadOrderList();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }

    let cancelled = false;

    async function loadOrderDetail() {
      setLoadingDetail(true);
      setError(null);
      try {
        const data = await api<AdminOrderDetail>(`/admin/orders/${selectedOrderId}`);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setError(getApiErrorMessageWithHint(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    void loadOrderDetail();
    return () => {
      cancelled = true;
    };
  }, [api, selectedOrderId]);

  const runAction = async (
    actionKey: string,
    endpoint: string,
    options: { method?: "POST" | "PATCH"; body?: Record<string, unknown> } = {},
  ) => {
    if (!selectedOrderId) {
      setError("Select an order first.");
      return;
    }
    setBusyAction(actionKey);
    setError(null);
    setSuccess(null);
    try {
      const method = options.method ?? "POST";
      await api(endpoint.replace(":id", selectedOrderId), {
        method,
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify(options.body ?? {}),
      });
      setSuccess("Action completed. Refreshing order state…");
      await loadDetail(selectedOrderId);
      await loadOrders();
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setBusyAction(null);
    }
  };

  const runPrintLabel = async () => {
    if (!selectedOrderId) {
      return;
    }
    setBusyAction("print-label");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<AdminPrintLabelResponse>(
        `/admin/orders/${selectedOrderId}/print-label`,
        {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify({}),
        },
      );
      if (result.labelUrl) {
        window.open(result.labelUrl, "_blank", "noopener,noreferrer");
      }
      setSuccess("Label ready.");
      await loadDetail(selectedOrderId);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setBusyAction(null);
    }
  };

  const runSchedulePickup = async () => {
    if (!selectedOrderId) {
      return;
    }
    setBusyAction("schedule-pickup");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<AdminSchedulePickupResponse>(
        `/admin/orders/${selectedOrderId}/schedule-pickup`,
        {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify({}),
        },
      );
      setSuccess(
        result.pickupScheduledDate
          ? `Pickup scheduled for ${result.pickupScheduledDate}.`
          : "Pickup scheduled with Shiprocket.",
      );
      await loadDetail(selectedOrderId);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setBusyAction(null);
    }
  };

  const downloadInvoice = async () => {
    if (!selectedOrderId || !detail?.invoice?.hasPdf || !accessToken) {
      return;
    }
    const url = `${getBrowserApiBaseUrl()}/admin/orders/${selectedOrderId}/invoice.pdf`;
    setBusyAction("invoice");
    setError(null);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Unable to download invoice.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${detail.invoice.invoiceNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice download failed.");
    } finally {
      setBusyAction(null);
    }
  };

  const shipment = detail?.shipment;
  const hasShipment = Boolean(shipment?.awb);
  const hasShiprocketId = Boolean(shipment?.shiprocketShipmentId);
  const pickupScheduled = Boolean(shipment?.pickupScheduledDate);
  const labelUrl = shipment?.shipmentLabelUrl ?? shipment?.labelUrl ?? null;

  const canSchedulePickup =
    hasShiprocketId && !pickupScheduled && detail?.status !== "DELIVERED";
  const canPrintLabel = hasShipment;
  const canShip = detail?.canShipNow === true;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <header className="grid gap-1">
        <h3 className="font-medium">Order fulfillment (Shiprocket)</h3>
        <p className="text-sm text-muted-foreground">
          COD cash collection is synced from Shiprocket when delivery is reported — do not
          mark COD collected manually in admin.
        </p>
      </header>

      <label className="grid gap-1 text-sm">
        Select order
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={selectedOrderId}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedOrderId(value);
            if (!value) {
              setDetail(null);
            }
          }}
        >
          <option value="">Select</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.orderNumber} · {order.paymentMode} · {order.status}
            </option>
          ))}
        </select>
      </label>

      {selectedOrderId ? (
        <p className="text-sm">
          <Link className="underline" href={`/admin/orders/${selectedOrderId}`}>
            Open order detail page
          </Link>
        </p>
      ) : null}

      {loadingDetail ? (
        <p className="text-sm text-muted-foreground">Loading order contract…</p>
      ) : null}

      {detail && detail.id === selectedOrderId ? (
        <dl className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
          <DetailRowItem label="Payment mode" value={detail.paymentMode} />
          <DetailRowItem label="Order status" value={detail.status} />
          <DetailRowItem label="Payment status" value={detail.payment?.status ?? "—"} />
          <DetailRowItem
            label="COD / collection"
            value={codCollectionCopy(
              detail.paymentMode,
              detail.payment?.status,
              detail.status,
            )}
          />
          <DetailRowItem
            label="Can ship now"
            value={
              detail.canShipNow
                ? "Yes"
                : `No — ${detail.shipBlockReason ?? "blocked"}`
            }
          />
          <DetailRowItem label="AWB" value={shipment?.awb ?? "Not booked yet"} />
          <DetailRowItem label="Shipment status" value={shipment?.status ?? "—"} />
          <DetailRowItem
            label="Pickup scheduled"
            value={shipment?.pickupScheduledDate ?? "Not yet"}
          />
          {labelUrl ? (
            <div>
              <dt className="text-muted-foreground">Label</dt>
              <dd>
                <a
                  className="underline"
                  href={labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open shipping label
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="grid gap-2 md:grid-cols-3">
        <button
          type="button"
          disabled={!canShip || busyAction !== null}
          className="h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => runAction("ship", "/admin/orders/:id/ship")}
        >
          {busyAction === "ship" ? "Booking…" : "1. Ship order (book AWB)"}
        </button>
        <button
          type="button"
          disabled={!canSchedulePickup || busyAction !== null}
          className="h-10 rounded-md border border-border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          onClick={runSchedulePickup}
          title={
            canSchedulePickup
              ? "Schedule Shiprocket pickup"
              : "Requires Shiprocket shipment ID after booking"
          }
        >
          {busyAction === "schedule-pickup" ? "Scheduling…" : "2. Schedule pickup"}
        </button>
        <button
          type="button"
          disabled={!canPrintLabel || busyAction !== null}
          className="h-10 rounded-md border border-border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          onClick={runPrintLabel}
          title={canPrintLabel ? "Generate or open label" : "Book shipment first"}
        >
          {busyAction === "print-label" ? "Generating…" : "3. Print label"}
        </button>
      </div>

      <SecondaryActionsSection
        busyAction={busyAction}
        hasInvoice={detail?.invoice?.hasPdf === true}
        canRefund={canRefund}
        refundPending={detail?.status === "REFUND_PENDING" || detail?.status === "REFUNDED"}
        onRefund={() =>
          runAction("refund", "/admin/orders/:id/status", {
            method: "PATCH",
            body: { status: "REFUNDED", note: "Refund initiated from admin fulfillment panel" },
          })
        }
        onCancel={() =>
          runAction("cancel", "/admin/orders/:id/cancel", {
            body: { reason: "Cancelled by admin fulfillment panel" },
          })
        }
        onRetriggerEmail={() =>
          runAction("retrigger", "/admin/orders/:id/notifications/retrigger", {
            body: { template: "OrderConfirmed", channels: ["EMAIL"] },
          })
        }
        onDownloadInvoice={downloadInvoice}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}

interface SecondarySectionProps {
  busyAction: string | null;
  hasInvoice: boolean;
  canRefund: boolean;
  refundPending: boolean;
  onRefund: () => void;
  onCancel: () => void;
  onRetriggerEmail: () => void;
  onDownloadInvoice: () => void;
}

function SecondaryActionsSection({
  busyAction,
  hasInvoice,
  canRefund,
  refundPending,
  onRefund,
  onCancel,
  onRetriggerEmail,
  onDownloadInvoice,
}: SecondarySectionProps) {
  return (
    <div className="grid gap-2 border-t border-border pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Other actions
      </p>
      <div className="flex flex-wrap gap-2">
        {canRefund ? (
          <button
            type="button"
            disabled={busyAction !== null || refundPending}
            className="h-9 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            onClick={onRefund}
          >
            {refundPending ? "Refund pending…" : "Request refund"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busyAction !== null}
          className="h-9 rounded-md bg-amber-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          onClick={onCancel}
        >
          Cancel order
        </button>
        <button
          type="button"
          disabled={busyAction !== null}
          className="h-9 rounded-md border border-border px-3 text-sm"
          onClick={onRetriggerEmail}
        >
          Retrigger email
        </button>
        {hasInvoice ? (
          <button
            type="button"
            disabled={busyAction !== null}
            className="h-9 rounded-md border border-border px-3 text-sm"
            onClick={onDownloadInvoice}
          >
            Download invoice
          </button>
        ) : null}
      </div>
    </div>
  );
}
