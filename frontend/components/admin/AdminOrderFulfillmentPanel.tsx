"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { getBrowserApiBaseUrl } from "@/lib/api-base";
import { ApiError } from "@/lib/api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { notifyAdminDataChanged } from "@/lib/admin-data-refresh";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth";
import { getPaginatedItems } from "@/lib/admin-api";
import type {
  AdminOrderDetail,
  AdminOrdersListResponse,
  AdminPrintLabelResponse,
  AdminSchedulePickupResponse,
} from "@/types/admin-order";

interface AdminOrderFulfillmentPanelProps {
  initialOrderId?: string;
  hideOrderPicker?: boolean;
}

function DetailRowItem({ label, value }: { label: string; value: React.ReactNode }) {
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
  hideOrderPicker = false,
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
  const [pickupWasScheduled, setPickupWasScheduled] = useState(false);
  const pollCancelRef = useRef<(() => void) | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api<AdminOrdersListResponse>("/admin/orders?page=1&limit=30");
      setOrders(getPaginatedItems(data));
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
    if (hideOrderPicker || initialOrderId) {
      return;
    }

    let cancelled = false;

    async function loadOrderList() {
      try {
        const data = await api<AdminOrdersListResponse>("/admin/orders?page=1&limit=30");
        if (!cancelled) {
          setOrders(getPaginatedItems(data));
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
  }, [api, hideOrderPicker, initialOrderId]);

  useEffect(() => {
    if (initialOrderId) {
      setSelectedOrderId(initialOrderId);
    }
  }, [initialOrderId]);

  // Reset pickup local state when order changes
  useEffect(() => {
    setPickupWasScheduled(false);
  }, [selectedOrderId]);

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

  const pollUntilShipped = useCallback(
    (orderId: string) => {
      let cancelled = false;
      // Cancel any previous poll
      pollCancelRef.current?.();
      pollCancelRef.current = () => { cancelled = true; };

      const run = async () => {
        const maxAttempts = 12; // 12 × 5s = 60s
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise<void>((res) => setTimeout(res, 5000));
          if (cancelled) return;
          try {
            const data = await api<AdminOrderDetail>(`/admin/orders/${orderId}`);
            if (cancelled) return;
            setDetail(data);
            if (data.status === "SHIPPED" || data.shipment?.awb) {
              setSuccess("Shipment booked! AWB has been assigned.");
              notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
              // Worker may still be transitioning status — do a final refresh after 3s
              await new Promise<void>((res) => setTimeout(res, 3000));
              if (cancelled) return;
              try {
                const final = await api<AdminOrderDetail>(`/admin/orders/${orderId}`);
                if (!cancelled) setDetail(final);
              } catch {
                // ignore
              }
              return;
            }
          } catch {
            // ignore transient errors during polling
          }
        }
        if (!cancelled) {
          setSuccess(
            "Shipment booking was queued but AWB is not yet assigned. Check the worker logs for errors, or refresh this page in a minute.",
          );
        }
      };
      void run();
    },
    [api],
  );

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
      if (actionKey === "ship") {
        setSuccess("Shipment booking queued — polling for AWB (up to 60s)…");
        await loadDetail(selectedOrderId);
        if (!hideOrderPicker) {
          await loadOrders();
        }
        pollUntilShipped(selectedOrderId);
      } else {
        setSuccess("Action completed. Refreshing order state…");
        await loadDetail(selectedOrderId);
        if (!hideOrderPicker) {
          await loadOrders();
        }
        notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
      }
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
      notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
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
      setPickupWasScheduled(true);
      setSuccess(
        result.pickupScheduledDate
          ? `Pickup scheduled for ${result.pickupScheduledDate}.`
          : "Pickup scheduled with Shiprocket.",
      );
      await loadDetail(selectedOrderId);
      notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
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
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (typeof body === "object" && body !== null && "error" in body) {
          const err = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
          throw new ApiError(
            err?.code ?? "UNKNOWN_ERROR",
            err?.message ?? "Unable to download invoice.",
            response.status,
            err?.details as never,
          );
        }
        throw new ApiError("UNKNOWN_ERROR", "Unable to download invoice.", response.status);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${detail.invoice.invoiceNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
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
    hasShiprocketId && !pickupScheduled && !pickupWasScheduled && detail?.status !== "DELIVERED";
  const canPrintLabel = hasShipment;
  const canShip = detail?.canShipNow === true;
  const canSync = hasShipment && !["DELIVERED", "CANCELLED"].includes(detail?.shipment?.status ?? "");

  const runSyncStatus = async () => {
    if (!shipment?.id || busyAction) return;
    setBusyAction("sync");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<{ synced: boolean; message: string; shipmentStatus: string; orderStatus: string }>(
        `/admin/shipments/${shipment.id}/sync`,
        { method: "POST" }
      );
      setSuccess(result.message);
      if (result.synced) {
        notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
        await loadDetail(selectedOrderId!);
      }
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setBusyAction(null);
    }
  };

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
        {!hideOrderPicker ? (
          <>
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
          </>
        ) : (
          <>
            Order
            <p className="font-medium">{detail?.orderNumber ?? selectedOrderId}</p>
          </>
        )}
      </label>

      {!hideOrderPicker && selectedOrderId ? (
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
          <DetailRowItem
            label="Shipment status"
            value={
              <span className="flex items-center gap-2">
                {shipment?.status ?? "—"}
                {canSync && (
                  <button
                    type="button"
                    onClick={runSyncStatus}
                    disabled={busyAction !== null}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    title="Pull latest status from Shiprocket"
                  >
                    {busyAction === "sync" ? "Syncing…" : "↻ Sync"}
                  </button>
                )}
              </span>
            }
          />
          <DetailRowItem
            label="Pickup scheduled"
            value={
              shipment?.pickupScheduledDate ??
              (pickupWasScheduled ? "Scheduled (date not returned by courier)" : "Not yet")
            }
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
