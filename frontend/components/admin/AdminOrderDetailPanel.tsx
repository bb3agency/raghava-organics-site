"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import type { AdminOrderDetailFull } from "@/lib/admin-api";
import { getBrowserApiBaseUrl } from "@/lib/api-base";
import { formatAdminDate, formatPaise, orderStatusTone } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthStore } from "@/stores/auth";

interface AdminOrderDetailPanelProps {
  orderId: string;
}

export function AdminOrderDetailPanel({ orderId }: AdminOrderDetailPanelProps) {
  const api = useAuthenticatedApi();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<AdminOrderDetailFull | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api<AdminOrderDetailFull>(`/admin/orders/${orderId}`);
      setOrder(detail);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [api, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const address = order?.shippingAddress;

  async function downloadInvoice() {
    if (!order?.invoice?.hasPdf || !accessToken) return;
    setDownloadingInvoice(true);
    try {
      const url = `${getBrowserApiBaseUrl()}/admin/orders/${orderId}/invoice.pdf`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to download invoice.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${order.invoice.invoiceNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice download failed.");
    } finally {
      setDownloadingInvoice(false);
    }
  }

  return (
    <AdminSection
      title={order ? order.orderNumber : "Order detail"}
      description={
        order
          ? `${formatAdminDate(order.createdAt)} · ${order.paymentMode}`
          : "Loading order…"
      }
      loading={loading}
      error={error}
      actions={
        order ? (
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge label={order.status} tone={orderStatusTone(order.status)} />
            {order.invoice?.hasPdf ? (
              <button
                type="button"
                className="h-8 rounded-md border border-border px-3 text-xs"
                disabled={downloadingInvoice}
                onClick={() => void downloadInvoice()}
              >
                {downloadingInvoice ? "Downloading…" : "Invoice PDF"}
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      {order ? (
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryBlock title="Customer">
              <p className="font-medium">{order.customer.name}</p>
              <p className="text-xs text-muted-foreground">{order.customer.email ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{order.customer.phone ?? "—"}</p>
              <Link
                href={`/admin/customers/${order.userId}`}
                className="mt-2 inline-block text-xs text-primary hover:underline"
              >
                View customer
              </Link>
            </SummaryBlock>
            <SummaryBlock title="Shipping address">
              {address ? (
                <>
                  <p>{address.fullName}</p>
                  <p className="text-xs text-muted-foreground">{address.line1}</p>
                  {address.line2 ? (
                    <p className="text-xs text-muted-foreground">{address.line2}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {address.city}, {address.state} {address.pincode}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </SummaryBlock>
            <SummaryBlock title="Totals">
              <dl className="grid gap-1 text-sm">
                <Row label="Subtotal" value={formatPaise(order.subtotal)} />
                <Row label="Shipping" value={formatPaise(order.shippingCharge)} />
                <Row label="Discount" value={formatPaise(order.discountAmount)} />
                <Row label="Total" value={formatPaise(order.total)} bold />
              </dl>
            </SummaryBlock>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SummaryBlock title="Payment">
              {order.payment ? (
                <dl className="grid gap-1 text-sm">
                  <Row label="Provider" value={order.payment.provider} />
                  <Row label="Status" value={order.payment.status} />
                  <Row label="Method" value={order.payment.method ?? "—"} />
                  <Row label="Amount" value={formatPaise(order.payment.amount)} />
                  <Row
                    label="Captured"
                    value={
                      order.payment.capturedAt
                        ? formatAdminDate(order.payment.capturedAt)
                        : "—"
                    }
                  />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No payment record</p>
              )}
            </SummaryBlock>
            <SummaryBlock title="Shipment">
              {order.shipment ? (
                <dl className="grid gap-1 text-sm">
                  <Row label="Provider" value={order.shipment.provider} />
                  <Row label="Status" value={order.shipment.status} />
                  <Row label="AWB" value={order.shipment.awb ?? "—"} />
                  {order.shipment.trackingUrl ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">Tracking</dt>
                      <dd>
                        <a
                          href={order.shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Open tracking
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Not shipped yet</p>
              )}
            </SummaryBlock>
          </div>

          {order.notes ? (
            <SummaryBlock title="Order notes">
              <p className="text-sm">{order.notes}</p>
            </SummaryBlock>
          ) : null}
        </div>
      ) : null}
    </AdminSection>
  );
}

function SummaryBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={bold ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}
