"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import {
  buildAdminQuery,
  type AdminCouponAnalyticsItem,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";

export function AdminCouponAnalyticsPanel() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<AdminCouponAnalyticsItem> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<AdminCouponAnalyticsItem>>(
        `/admin/coupons/analytics${buildAdminQuery({ page, limit: 20 })}`,
      );
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <AdminSection
      title="Coupon analytics"
      description="Usage and total discount by code."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No coupon analytics yet."
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Uses</th>
                  <th className="px-3 py-2 font-medium">Total discount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.couponId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono">{item.code}</td>
                    <td className="px-3 py-2">{item.usesCount}</td>
                    <td className="px-3 py-2">{formatPaise(item.totalDiscountPaise)}</td>
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
