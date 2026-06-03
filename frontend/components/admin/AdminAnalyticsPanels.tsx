"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import {
  AdminDashboardKpisPanel,
  AdminSalesChartPanel,
  AdminTopProductsPanel,
} from "@/components/admin/AdminDashboardPanels";
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
  readPaginatedItems,
  toIsoDateRange,
} from "@/lib/admin-api";
import { formatAdminDate, formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const inputClass =
  "h-9 rounded-md border border-border bg-background px-2 text-sm";

function DateRangeFilters({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <input type="date" className={inputClass} value={from} onChange={(e) => onFromChange(e.target.value)} />
      <input type="date" className={inputClass} value={to} onChange={(e) => onToChange(e.target.value)} />
    </div>
  );
}

export function AdminAnalyticsPageContent() {
  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  return (
    <div className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Analytics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, funnel, category performance, inventory alerts, and notification delivery.
        </p>
        <div className="mt-3">
          <DateRangeFilters from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        </div>
      </header>
      <AdminDashboardKpisPanel />
      <AdminRevenueAnalyticsPanel from={from} to={to} />
      <AdminFunnelPanel from={from} to={to} />
      <AdminCategoryBreakdownPanel from={from} to={to} />
      <AdminInventoryAlertsPanel />
      <AdminNotificationStatsPanel from={from} to={to} />
      <AdminSalesChartPanel />
      <AdminTopProductsPanel />
    </div>
  );
}

function AdminRevenueAnalyticsPanel({ from, to }: { from: string; to: string }) {
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
              <tr key={point.bucket} className="border-b border-border last:border-0">
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
              <tr key={step.eventType} className="border-b border-border last:border-0">
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

function AdminCategoryBreakdownPanel({ from, to }: { from: string; to: string }) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsCategoryBreakdown | null>(null);

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

  const items = ensureArray<AdminAnalyticsCategoryBreakdown["items"][number]>(data?.items);

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
              <tr key={item.categoryId} className="border-b border-border last:border-0">
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
    void api<{ items: AdminInventoryAlertItem[] }>("/admin/analytics/inventory-alerts")
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
              <tr key={item.variantId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.variantName}</p>
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

function AdminNotificationStatsPanel({ from, to }: { from: string; to: string }) {
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

  const channels = ensureArray<AdminNotificationDeliveryStats["channels"][number]>(
    data?.channels,
  );

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
              <tr key={channel.channel} className="border-b border-border last:border-0">
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
