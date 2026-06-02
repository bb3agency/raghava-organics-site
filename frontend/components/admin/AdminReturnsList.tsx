"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import {
  buildAdminQuery,
  normalizePagination,
  type AdminReturnRequestListItem,
  type FlatPaginatedResponse,
} from "@/lib/admin-api";
import { formatAdminDate, returnStatusTone } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

const PAGE_SIZE = 20;
const RETURN_STATUSES = ["", "REQUESTED", "APPROVED", "REJECTED", "PICKED_UP", "REFUNDED"];

export function AdminReturnsList() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FlatPaginatedResponse<AdminReturnRequestListItem> | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<FlatPaginatedResponse<AdminReturnRequestListItem>>(
        `/admin/return-requests${buildAdminQuery({
          page,
          limit: PAGE_SIZE,
          status: statusFilter || undefined,
        })}`,
      );
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const items = data?.items ?? [];
  const meta = data ? normalizePagination(data) : null;

  return (
    <AdminSection
      title="Return requests"
      description="Customer return and refund workflow."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No return requests found."
      actions={
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Filter by status"
        >
          {RETURN_STATUSES.map((status) => (
            <option key={status || "all"} value={status}>
              {status || "All statuses"}
            </option>
          ))}
        </select>
      }
    >
      {data && meta ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Requested</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/returns/${item.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <p>{item.customerName}</p>
                      <p className="text-xs text-muted-foreground">{item.customerEmail}</p>
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge
                        label={item.status}
                        tone={returnStatusTone(item.status)}
                      />
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-xs">{item.reason}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAdminDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination meta={meta} onPageChange={setPage} />
        </>
      ) : null}
    </AdminSection>
  );
}
