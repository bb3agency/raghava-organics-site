"use client";



import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";

import { AdminSection } from "@/components/admin/AdminSection";

import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

import { Button } from "@/components/ui/button";

import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

import {

  buildAdminQuery,

  buildOrdersExportQuery,

  ORDER_FILTER_STATUSES,

  type AdminOrderListItem,

  type PaginatedResponse,

} from "@/lib/admin-api";

import { formatAdminDate, formatPaise, orderStatusTone } from "@/lib/admin-format";

import { resolveApiBaseUrl } from "@/lib/api-base";

import { getApiErrorMessage } from "@/lib/error-messages";

import { useAuthStore } from "@/stores/auth";



const PAGE_SIZE = 20;

const inputClass =

  "h-9 rounded-md border border-border bg-background px-2 text-sm";



function defaultExportDates() {

  const to = new Date();

  const from = new Date();

  from.setDate(from.getDate() - 30);

  return {

    from: from.toISOString().slice(0, 10),

    to: to.toISOString().slice(0, 10),

  };

}



export function AdminOrdersList() {

  const api = useAuthenticatedApi();

  const accessToken = useAuthStore((s) => s.accessToken);

  const [page, setPage] = useState(1);

  const [status, setStatus] = useState("");

  const [search, setSearch] = useState("");

  const [fromDate, setFromDate] = useState("");

  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<PaginatedResponse<AdminOrderListItem> | null>(null);

  const [exportFrom, setExportFrom] = useState(defaultExportDates().from);

  const [exportTo, setExportTo] = useState(defaultExportDates().to);



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const response = await api<PaginatedResponse<AdminOrderListItem>>(

        `/admin/orders${buildAdminQuery({

          page,

          limit: PAGE_SIZE,

          status: status || undefined,

          search: search.trim() || undefined,

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

  }, [api, page, status, search, fromDate, toDate]);



  useEffect(() => {

    void load();

  }, [load]);



  async function exportCsv() {

    setExporting(true);

    setError(null);

    try {

      const base = resolveApiBaseUrl();

      if (!base) throw new Error("API base URL not configured");

      const query = buildOrdersExportQuery({

        from: exportFrom,

        to: exportTo,

        status: status || undefined,

        search: search.trim() || undefined,

      });

      const response = await fetch(`${base}/admin/orders/export${query}`, {

        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},

        credentials: "include",

      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;

      anchor.download = "orders-export.csv";

      anchor.click();

      URL.revokeObjectURL(url);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Export failed");

    } finally {

      setExporting(false);

    }

  }



  const items = data?.items ?? [];



  return (

    <AdminSection

      title="Orders"

      description="Recent orders with payment and shipment summary."

      loading={loading}

      error={error}

      empty={!loading && !error && items.length === 0}

      emptyMessage="No orders found."

    >

      <div className="mb-4 grid gap-3 rounded-md border border-border bg-muted/20 p-3">

        <div className="flex flex-wrap gap-2">

          <input

            className={`${inputClass} min-w-40 flex-1`}

            placeholder="Search order # or customer"

            value={search}

            onChange={(event) => {

              setSearch(event.target.value);

              setPage(1);

            }}

          />

          <select

            className={inputClass}

            value={status}

            onChange={(event) => {

              setStatus(event.target.value);

              setPage(1);

            }}

          >

            <option value="">All statuses</option>

            {ORDER_FILTER_STATUSES.map((value) => (

              <option key={value} value={value}>

                {value}

              </option>

            ))}

          </select>

          <input

            type="date"

            className={inputClass}

            value={fromDate}

            onChange={(event) => {

              setFromDate(event.target.value);

              setPage(1);

            }}

            title="From date"

          />

          <input

            type="date"

            className={inputClass}

            value={toDate}

            onChange={(event) => {

              setToDate(event.target.value);

              setPage(1);

            }}

            title="To date"

          />

          <Button

            type="button"

            size="sm"

            variant="outline"

            onClick={() => {

              setSearch("");

              setStatus("");

              setFromDate("");

              setToDate("");

              setPage(1);

            }}

          >

            Clear

          </Button>

        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">

          <label className="grid gap-1 text-xs">

            Export from

            <input

              type="date"

              className={inputClass}

              value={exportFrom}

              onChange={(event) => setExportFrom(event.target.value)}

            />

          </label>

          <label className="grid gap-1 text-xs">

            Export to

            <input

              type="date"

              className={inputClass}

              value={exportTo}

              onChange={(event) => setExportTo(event.target.value)}

            />

          </label>

          <Button

            type="button"

            size="sm"

            disabled={exporting || !exportFrom || !exportTo}

            onClick={() => void exportCsv()}

          >

            {exporting ? "Exporting…" : "Export CSV"}

          </Button>

        </div>

      </div>



      {data ? (

        <>

          <div className="overflow-x-auto rounded-md border border-border">

            <table className="w-full min-w-[720px] text-left text-sm">

              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">

                <tr>

                  <th className="px-3 py-2 font-medium">Order</th>

                  <th className="px-3 py-2 font-medium">Customer</th>

                  <th className="px-3 py-2 font-medium">Status</th>

                  <th className="px-3 py-2 font-medium">Payment</th>

                  <th className="px-3 py-2 font-medium">Total</th>

                  <th className="px-3 py-2 font-medium">Created</th>

                </tr>

              </thead>

              <tbody>

                {items.map((order) => (

                  <tr key={order.id} className="border-b border-border last:border-0">

                    <td className="px-3 py-2">

                      <Link

                        href={`/admin/orders/${order.id}`}

                        className="font-medium text-primary hover:underline"

                      >

                        {order.orderNumber}

                      </Link>

                      <p className="text-xs text-muted-foreground">{order.paymentMode}</p>

                    </td>

                    <td className="px-3 py-2">

                      <p>{order.customerName}</p>

                      <p className="text-xs text-muted-foreground">{order.customerEmail}</p>

                    </td>

                    <td className="px-3 py-2">

                      <AdminStatusBadge

                        label={order.status}

                        tone={orderStatusTone(order.status)}

                      />

                    </td>

                    <td className="px-3 py-2 text-xs text-muted-foreground">

                      {order.paymentStatus ?? "—"}

                    </td>

                    <td className="px-3 py-2 font-medium">{formatPaise(order.total)}</td>

                    <td className="px-3 py-2 text-xs text-muted-foreground">

                      {formatAdminDate(order.createdAt)}

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

  );

}

