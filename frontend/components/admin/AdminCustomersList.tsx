"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import {
  buildAdminQuery,
  type AdminUserListItem,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatAdminDate, formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

const PAGE_SIZE = 20;

export function AdminCustomersList() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<AdminUserListItem> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<AdminUserListItem>>(
        `/admin/users${buildAdminQuery({ page, limit: PAGE_SIZE, search: search || undefined })}`,
      );
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const items = data?.items ?? [];

  return (
    <AdminSection
      title="Customers"
      description="Registered customer accounts."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No customer records found."
      actions={
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email, phone…"
            className="h-9 min-w-48 rounded-md border border-border bg-background px-2 text-sm"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            Search
          </button>
        </form>
      }
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Orders</th>
                  <th className="px-3 py-2 font-medium">Spend</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.firstName} {customer.lastName}
                      </Link>
                      <div className="mt-1">
                        <AdminStatusBadge
                          label={customer.isVerified ? "Verified" : "Unverified"}
                          tone={customer.isVerified ? "success" : "warning"}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p>{customer.email ?? "—"}</p>
                      <p className="text-muted-foreground">{customer.phone ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2">{customer.totalOrders}</td>
                    <td className="px-3 py-2">{formatPaise(customer.totalSpendPaise)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAdminDate(customer.createdAt)}
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
