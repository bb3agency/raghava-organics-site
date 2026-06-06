"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminSection";
import {
  AdminDashboardKpisPanel,
  AdminSalesChartPanel,
  AdminTopProductsPanel,
} from "@/components/admin/AdminDashboardPanels";
import {
  defaultDateRange,
  rangeToISO,
  trendPeriodLabel,
  type DateRange,
} from "@/components/admin/AdminDateRangePicker";
import { useAuthStore } from "@/stores/auth";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { useAdminDataRefreshEffect } from "@/hooks/use-admin-data-refresh-effect";
import { ADMIN_DASHBOARD_REFRESH_SCOPES } from "@/lib/admin-data-refresh";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { hasAdminPermission, ADMIN_PERMISSIONS } from "@/lib/permissions";
import type {
  AdminAnalyticsCategoryBreakdown,
  AdminAnalyticsFunnel,
  AdminAnalyticsRevenue,
  AdminInventoryAlertItem,
  AdminNotificationDeliveryStats,
  AdminSalesChartPoint,
} from "@/lib/admin-api";
import {
  buildAdminQuery,
  ensureArray,
  getPaginatedItems,
  toIsoDateRange,
} from "@/lib/admin-api";
import { formatAdminDate, formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAdminShell } from "@/contexts/admin-shell-context";

export function AdminAnalyticsPageContent() {
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const trendLabel = trendPeriodLabel(range.from, range.to);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { adminUser } = useAdminAuth();
  const canExport = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.analyticsExport);
  const [exporting, setExporting] = useState(false);
  const { registerExportHandler } = useAdminShell();

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const base = resolveApiBaseUrl();
      if (!base) throw new Error("API base URL not configured");
      const { fromISO, toISO } = rangeToISO(range.from, range.to);
      const url = `${base}/admin/analytics/revenue/export?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
      const response = await fetch(url, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `analytics-revenue-${range.from}-to-${range.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // user can retry
    } finally {
      setExporting(false);
    }
  }, [exporting, range.from, range.to, accessToken]);

  useEffect(() => {
    if (!canExport) return;
    return registerExportHandler(() => void handleExport());
  }, [registerExportHandler, handleExport, canExport]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Analytics"
        description="Revenue, funnel, category performance, inventory alerts, and notification delivery."
        range={range}
        onRangeChange={setRange}
      />
      <AdminDashboardKpisPanel
        from={range.from}
        to={range.to}
        trendLabel={trendLabel}
      />
      <AdminRevenueAnalyticsPanel from={range.from} to={range.to} />
      <AdminFunnelPanel from={range.from} to={range.to} />
      <AdminCategoryBreakdownPanel from={range.from} to={range.to} />
      <AdminInventoryAlertsPanel />
      <AdminNotificationStatsPanel from={range.from} to={range.to} />
      <AdminSalesChartPanel from={range.from} to={range.to} />
      <AdminTopProductsPanel from={range.from} to={range.to} />
    </div>
  );
}

function AdminRevenueAnalyticsPanel({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsRevenue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminAnalyticsRevenue>(
        `/admin/analytics/revenue${buildAdminQuery({
          granularity: "day",
          from: toIsoDateRange(from),
          to: toIsoDateRange(to, true),
        })}`,
      );
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useAdminDataRefreshEffect(load, ADMIN_DASHBOARD_REFRESH_SCOPES);

  const points = ensureArray<AdminSalesChartPoint>(data?.points);

  return (
    <AdminSection
      title="Revenue analytics"
      description={data ? `Granularity: ${data.granularity}` : undefined}
      loading={loading}
      error={error}
      empty={!loading && !error && points.length === 0}
      emptyMessage="No revenue data."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Bucket</th>
              <th className="px-3 py-2 font-medium">Orders</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={point.bucket}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2 text-xs">{point.bucket}</td>
                <td className="px-3 py-2">{point.ordersCount}</td>
                <td className="px-3 py-2">{formatPaise(point.revenuePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function AdminFunnelPanel({ from, to }: { from: string; to: string }) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsFunnel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<AdminAnalyticsFunnel>(
      `/admin/analytics/funnel${buildAdminQuery({
        from: toIsoDateRange(from),
        to: toIsoDateRange(to, true),
      })}`,
    )
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, from, to]);

  const steps = ensureArray<AdminAnalyticsFunnel["steps"][number]>(data?.steps);

  return (
    <AdminSection
      title="Conversion funnel"
      loading={loading}
      error={error}
      empty={!loading && !error && steps.length === 0}
      emptyMessage="No funnel data."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Step</th>
              <th className="px-3 py-2 font-medium">Count</th>
              <th className="px-3 py-2 font-medium">Conversion %</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr
                key={step.eventType}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2">{step.eventType}</td>
                <td className="px-3 py-2">{step.count}</td>
                <td className="px-3 py-2">{step.conversionRatePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function AdminCategoryBreakdownPanel({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsCategoryBreakdown | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void api<AdminAnalyticsCategoryBreakdown>(
      `/admin/analytics/category-breakdown${buildAdminQuery({
        from: toIsoDateRange(from),
        to: toIsoDateRange(to, true),
      })}`,
    )
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, from, to]);

  const items = ensureArray<AdminAnalyticsCategoryBreakdown["items"][number]>(
    data?.items,
  );

  return (
    <AdminSection
      title="Category breakdown"
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No category data."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.categoryId}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2">{item.categoryName}</td>
                <td className="px-3 py-2">{formatPaise(item.revenuePaise)}</td>
                <td className="px-3 py-2">{item.sharePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function AdminInventoryAlertsPanel() {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AdminInventoryAlertItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: AdminInventoryAlertItem[] }>(
      "/admin/analytics/inventory-alerts",
    )
      .then((response) => {
        if (!cancelled) setItems(getPaginatedItems(response));
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <AdminSection
      title="Inventory alerts"
      description="Variants currently at or below low-stock threshold."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No low-stock alerts."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Threshold</th>
              <th className="px-3 py-2 font-medium">Alerted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.variantId}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.variantName}
                  </p>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                <td className="px-3 py-2">{item.quantity}</td>
                <td className="px-3 py-2">{item.lowStockThreshold}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatAdminDate(item.occurredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function AdminNotificationStatsPanel({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminNotificationDeliveryStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<AdminNotificationDeliveryStats>(
      `/admin/analytics/notifications${buildAdminQuery({
        from: toIsoDateRange(from),
        to: toIsoDateRange(to, true),
      })}`,
    )
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, from, to]);

  const channels = ensureArray<
    AdminNotificationDeliveryStats["channels"][number]
  >(data?.channels);

  return (
    <AdminSection
      title="Notification delivery"
      loading={loading}
      error={error}
      empty={!loading && !error && channels.length === 0}
      emptyMessage="No notification stats."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Failed</th>
              <th className="px-3 py-2 font-medium">Delivery %</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr
                key={channel.channel}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2">{channel.channel}</td>
                <td className="px-3 py-2">{channel.total}</td>
                <td className="px-3 py-2">{channel.sent}</td>
                <td className="px-3 py-2">{channel.failed}</td>
                <td className="px-3 py-2">{channel.deliveryRatePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}
