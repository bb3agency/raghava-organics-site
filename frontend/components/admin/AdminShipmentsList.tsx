"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminDetailDrawer } from "@/components/admin/AdminDetailDrawer";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import {
  buildAdminQuery,
  SHIPMENT_FILTER_STATUSES,
  type AdminShipmentDetail,
  type AdminShipmentListItem,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatAdminDate } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

const PAGE_SIZE = 50;
const inputClass = "h-9 rounded-md border border-border bg-background px-2 text-sm";

export function AdminShipmentsList() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [awbNumber, setAwbNumber] = useState("");
  const [orderId, setOrderId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<AdminShipmentListItem> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminShipmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<AdminShipmentListItem>>(
        `/admin/shipments${buildAdminQuery({
          page,
          limit: PAGE_SIZE,
          status: status || undefined,
          awbNumber: awbNumber.trim() || undefined,
          orderId: orderId.trim() || undefined,
          from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
          to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
        })}`,
      );
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, page, status, awbNumber, orderId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(shipmentId: string) {
    setSelectedId(shipmentId);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await api<AdminShipmentDetail>(`/admin/shipments/${shipmentId}`);
      setDetail(response);
    } catch (err) {
      setDetailError(getApiErrorMessage(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function applyFilters() {
    setPage(1);
    void load();
  }

  function clearFilters() {
    setStatus("");
    setAwbNumber("");
    setOrderId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const items = data?.items ?? [];

  return (
    <>
      <AdminSection
        title="Shipments"
        description="All shipments across orders."
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        emptyMessage="No shipments found."
      >
        <div className="mb-4 grid gap-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap gap-2">
            <select
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {SHIPMENT_FILTER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              className={`${inputClass} min-w-32`}
              placeholder="AWB number"
              value={awbNumber}
              onChange={(event) => setAwbNumber(event.target.value)}
            />
            <input
              className={`${inputClass} min-w-36`}
              placeholder="Order ID"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            />
            <input
              type="date"
              className={inputClass}
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
            <input
              type="date"
              className={inputClass}
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
            <Button type="button" size="sm" variant="secondary" onClick={applyFilters}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>

        {data ? (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">AWB</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((shipment) => (
                    <tr key={shipment.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/orders/${shipment.orderId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {shipment.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{shipment.provider}</td>
                      <td className="px-3 py-2">
                        <AdminStatusBadge label={shipment.status} tone="default" />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {shipment.awbNumber ? (
                          shipment.trackingUrl ? (
                            <a
                              href={shipment.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              {shipment.awbNumber}
                            </a>
                          ) : (
                            shipment.awbNumber
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatAdminDate(shipment.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => void openDetail(shipment.id)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination meta={data.meta} onPageChange={setPage} />
          </>
        ) : null}
      </AdminSection>

      <AdminDetailDrawer
        open={Boolean(selectedId)}
        title={detail ? `Shipment · ${detail.orderNumber}` : "Shipment detail"}
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
          setDetailError(null);
        }}
      >
        {detailLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : detailError ? (
          <p className="text-sm text-destructive">{detailError}</p>
        ) : detail ? (
          <dl className="grid gap-2 text-sm">
            <Row label="Provider" value={detail.provider} />
            <Row label="Status" value={detail.status} />
            <Row label="AWB" value={detail.awbNumber ?? "—"} />
            <Row
              label="Pickup scheduled"
              value={
                detail.pickupScheduledDate ? formatAdminDate(detail.pickupScheduledDate) : "—"
              }
            />
            <Row label="Shiprocket ID" value={detail.shiprocketShipmentId ?? "—"} />
            <Row label="Created" value={formatAdminDate(detail.createdAt)} />
            <Row label="Updated" value={formatAdminDate(detail.updatedAt)} />
            {detail.trackingUrl ? (
              <a
                href={detail.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Open tracking
              </a>
            ) : null}
            {detail.labelUrl ? (
              <a
                href={detail.labelUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Open label
              </a>
            ) : null}
            <Link
              href={`/admin/orders/${detail.orderId}`}
              className="mt-2 inline-block text-primary hover:underline"
            >
              View order
            </Link>
          </dl>
        ) : null}
      </AdminDetailDrawer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
