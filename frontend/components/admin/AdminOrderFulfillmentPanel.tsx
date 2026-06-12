"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Truck,
  Calendar,
  Printer,
  RefreshCw,
  RotateCcw,
  Ban,
  Mail,
  FileDown,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
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

function codCollectionCopy(
  paymentMode: AdminOrderDetail["paymentMode"],
  paymentStatus: string | null | undefined,
  orderStatus: string,
): string {
  if (paymentMode !== "COD") {
    return "Prepaid — captured via Razorpay.";
  }
  if (paymentStatus === "CAPTURED") {
    return "COD collected — synced from Shiprocket delivery webhook.";
  }
  if (orderStatus === "DELIVERED") {
    return "Delivered — awaiting payment capture from webhook.";
  }
  return "Shiprocket collects cash on delivery; captured automatically on DELIVERED webhook.";
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
      if (!orderId) { setDetail(null); return; }
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
    if (hideOrderPicker || initialOrderId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<AdminOrdersListResponse>("/admin/orders?page=1&limit=30");
        if (!cancelled) setOrders(getPaginatedItems(data));
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessageWithHint(err));
      }
    })();
    return () => { cancelled = true; };
  }, [api, hideOrderPicker, initialOrderId]);

  useEffect(() => {
    if (initialOrderId) setSelectedOrderId(initialOrderId);
  }, [initialOrderId]);

  useEffect(() => { setPickupWasScheduled(false); }, [selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) return;
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void (async () => {
      try {
        const data = await api<AdminOrderDetail>(`/admin/orders/${selectedOrderId}`);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) { setDetail(null); setError(getApiErrorMessageWithHint(err)); }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, selectedOrderId]);

  const pollUntilShipped = useCallback(
    (orderId: string) => {
      let cancelled = false;
      pollCancelRef.current?.();
      pollCancelRef.current = () => { cancelled = true; };
      void (async () => {
        const maxAttempts = 12;
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
              await new Promise<void>((res) => setTimeout(res, 3000));
              if (cancelled) return;
              try {
                const final = await api<AdminOrderDetail>(`/admin/orders/${orderId}`);
                if (!cancelled) setDetail(final);
              } catch { /* ignore */ }
              return;
            }
          } catch { /* ignore transient */ }
        }
        if (!cancelled) {
          setSuccess("Shipment queued but AWB not yet assigned. Check worker logs or refresh in a minute.");
        }
      })();
    },
    [api],
  );

  const runAction = async (
    actionKey: string,
    endpoint: string,
    options: { method?: "POST" | "PATCH"; body?: Record<string, unknown> } = {},
  ) => {
    if (!selectedOrderId) { setError("Select an order first."); return; }
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
        if (!hideOrderPicker) await loadOrders();
        pollUntilShipped(selectedOrderId);
      } else {
        setSuccess("Action completed. Refreshing order state…");
        await loadDetail(selectedOrderId);
        if (!hideOrderPicker) await loadOrders();
        notifyAdminDataChanged(["orders", "shipments", "dashboard"]);
      }
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setBusyAction(null);
    }
  };

  const runPrintLabel = async () => {
    if (!selectedOrderId) return;
    setBusyAction("print-label");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<AdminPrintLabelResponse>(
        `/admin/orders/${selectedOrderId}/print-label`,
        { method: "POST", idempotencyKey: createIdempotencyKey(), body: JSON.stringify({}) },
      );
      if (result.labelUrl) window.open(result.labelUrl, "_blank", "noopener,noreferrer");
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
    if (!selectedOrderId) return;
    setBusyAction("schedule-pickup");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<AdminSchedulePickupResponse>(
        `/admin/orders/${selectedOrderId}/schedule-pickup`,
        { method: "POST", idempotencyKey: createIdempotencyKey(), body: JSON.stringify({}) },
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
    if (!selectedOrderId || !detail?.invoice?.hasPdf || !accessToken) return;
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
        try { body = await response.json(); } catch { body = null; }
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
  const canSync =
    hasShipment && !["DELIVERED", "CANCELLED"].includes(detail?.shipment?.status ?? "");

  const runSyncStatus = async () => {
    if (!shipment?.id || busyAction) return;
    setBusyAction("sync");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<{ synced: boolean; message: string; shipmentStatus: string; orderStatus: string }>(
        `/admin/shipments/${shipment.id}/sync`,
        { method: "POST" },
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
    <section className="rounded-xl border border-border bg-card">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold">
            Order fulfillment
            <span className="ml-2 text-xs font-normal text-muted-foreground">via Shiprocket</span>
          </h2>
          {!hideOrderPicker && selectedOrderId ? (
            <Link
              href={`/admin/orders/${selectedOrderId}`}
              className="text-xs text-primary hover:underline"
            >
              Open detail →
            </Link>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          COD cash collection is synced automatically from Shiprocket on delivery — do not
          mark COD collected manually.
        </p>
      </header>

      <div className="p-6 grid gap-6">
        {/* Order picker */}
        {!hideOrderPicker ? (
          <label className="grid gap-1.5 text-sm font-medium">
            Select order
            <select
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={selectedOrderId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedOrderId(v);
                if (!v) setDetail(null);
              }}
            >
              <option value="">— choose —</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.paymentMode} · {order.status}
                </option>
              ))}
            </select>
          </label>
        ) : detail ? (
          <div className="text-sm">
            <span className="text-muted-foreground">Order </span>
            <span className="font-semibold">{detail.orderNumber}</span>
          </div>
        ) : null}

        {loadingDetail ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : null}

        {/* Order info grid */}
        {detail && detail.id === selectedOrderId ? (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <InfoChip
              label="Payment mode"
              value={detail.paymentMode}
            />
            <InfoChip
              label="Order status"
              value={detail.status}
              valueClass={
                detail.status === "CANCELLED" || detail.status === "REFUNDED"
                  ? "text-destructive"
                  : detail.status === "DELIVERED"
                    ? "text-emerald-600"
                    : undefined
              }
            />
            <InfoChip
              label="Payment status"
              value={detail.payment?.status ?? "—"}
              valueClass={detail.payment?.status === "CAPTURED" ? "text-emerald-600" : undefined}
            />
            <InfoChip
              label="COD / collection"
              value={codCollectionCopy(
                detail.paymentMode,
                detail.payment?.status,
                detail.status,
              )}
            />
            <InfoChip
              label="Can ship now"
              valueNode={
                detail.canShipNow ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5" />
                    {detail.shipBlockReason ?? "Blocked"}
                  </span>
                )
              }
            />
            <InfoChip label="AWB" value={shipment?.awb ?? "Not booked yet"} mono />
            <InfoChip
              label="Shipment status"
              valueNode={
                <span className="flex items-center gap-2">
                  <span
                    className={
                      shipment?.status === "CANCELLED"
                        ? "text-destructive"
                        : shipment?.status === "DELIVERED"
                          ? "text-emerald-600"
                          : undefined
                    }
                  >
                    {shipment?.status ?? "—"}
                  </span>
                  {canSync ? (
                    <button
                      type="button"
                      onClick={runSyncStatus}
                      disabled={busyAction !== null}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                      title="Pull latest status from Shiprocket"
                    >
                      <RefreshCw className={`h-3 w-3 ${busyAction === "sync" ? "animate-spin" : ""}`} />
                      {busyAction === "sync" ? "Syncing…" : "Sync"}
                    </button>
                  ) : null}
                </span>
              }
            />
            <InfoChip
              label="Pickup scheduled"
              value={
                shipment?.pickupScheduledDate ??
                (pickupWasScheduled ? "Scheduled (date not returned)" : "Not yet")
              }
            />
            {labelUrl ? (
              <div className="sm:col-span-2">
                <p className="mb-0.5 text-xs text-muted-foreground">Label</p>
                <a
                  href={labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open shipping label →
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Primary action steps */}
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionButton
            step={1}
            label="Ship order"
            sublabel="Book AWB"
            icon={<Truck className="h-4 w-4" />}
            busy={busyAction === "ship"}
            disabled={!canShip || busyAction !== null}
            onClick={() => runAction("ship", "/admin/orders/:id/ship")}
            primary
          />
          <ActionButton
            step={2}
            label="Schedule pickup"
            sublabel="Request courier"
            icon={<Calendar className="h-4 w-4" />}
            busy={busyAction === "schedule-pickup"}
            disabled={!canSchedulePickup || busyAction !== null}
            onClick={runSchedulePickup}
            title={canSchedulePickup ? undefined : "Requires Shiprocket ID after booking"}
          />
          <ActionButton
            step={3}
            label="Print label"
            sublabel="Download PDF"
            icon={<Printer className="h-4 w-4" />}
            busy={busyAction === "print-label"}
            disabled={!canPrintLabel || busyAction !== null}
            onClick={runPrintLabel}
            title={canPrintLabel ? undefined : "Book shipment first"}
          />
        </div>

        {/* Secondary actions */}
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Other actions
          </p>
          <div className="flex flex-wrap gap-2">
            {canRefund ? (
              <SecondaryButton
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                label={
                  detail?.status === "REFUND_PENDING" || detail?.status === "REFUNDED"
                    ? "Refund pending…"
                    : "Request refund"
                }
                disabled={
                  busyAction !== null ||
                  detail?.status === "REFUND_PENDING" ||
                  detail?.status === "REFUNDED"
                }
                variant="danger"
                onClick={() =>
                  runAction("refund", "/admin/orders/:id/status", {
                    method: "PATCH",
                    body: { status: "REFUNDED", note: "Refund initiated from admin fulfillment panel" },
                  })
                }
              />
            ) : null}
            <SecondaryButton
              icon={<Ban className="h-3.5 w-3.5" />}
              label="Cancel order"
              disabled={busyAction !== null}
              variant="warning"
              onClick={() =>
                runAction("cancel", "/admin/orders/:id/cancel", {
                  body: { reason: "Cancelled by admin fulfillment panel" },
                })
              }
            />
            <SecondaryButton
              icon={<Mail className="h-3.5 w-3.5" />}
              label="Retrigger email"
              disabled={busyAction !== null}
              onClick={() =>
                runAction("retrigger", "/admin/orders/:id/notifications/retrigger", {
                  body: { template: "OrderConfirmed", channels: ["EMAIL"] },
                })
              }
            />
            {detail?.invoice?.hasPdf ? (
              <SecondaryButton
                icon={<FileDown className="h-3.5 w-3.5" />}
                label="Download invoice"
                disabled={busyAction !== null}
                onClick={downloadInvoice}
              />
            ) : null}
          </div>
        </div>

        {/* Feedback */}
        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}{" "}
            <span className="text-muted-foreground">You can safely retry after a short pause.</span>
          </p>
        ) : null}
        {success ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function InfoChip({
  label,
  value,
  valueNode,
  mono,
  valueClass,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {valueNode ?? (
        <span className={`text-sm font-medium ${mono ? "font-mono" : ""} ${valueClass ?? ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function ActionButton({
  step,
  label,
  sublabel,
  icon,
  busy,
  disabled,
  onClick,
  primary,
  title,
}: {
  step: number;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${primary
          ? "border-primary/30 bg-primary/5 hover:bg-primary/10 disabled:hover:bg-primary/5"
          : "border-border bg-background hover:bg-muted/50 disabled:hover:bg-background"
        }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {busy ? <Clock className="h-3.5 w-3.5 animate-pulse" /> : step}
        </span>
        <span className={primary ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      </div>
      <p className="text-sm font-semibold leading-tight">
        {busy ? `${label.split(" ")[0]}ing…` : label}
      </p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </button>
  );
}

function SecondaryButton({
  icon,
  label,
  disabled,
  onClick,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant?: "danger" | "warning";
}) {
  const variantClass =
    variant === "danger"
      ? "border-destructive/30 text-destructive hover:bg-destructive/5"
      : variant === "warning"
        ? "border-amber-300 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20"
        : "border-border text-foreground hover:bg-muted/50";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50 ${variantClass}`}
    >
      {icon}
      {label}
    </button>
  );
}
