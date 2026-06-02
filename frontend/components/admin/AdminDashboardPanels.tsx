"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { Button } from "@/components/ui/button";
import type {
  AdminDashboardKpis,
  AdminSalesChart,
  AdminTopProducts,
  DashboardKpiPeriod,
} from "@/lib/admin-api";
import { buildAdminQuery, DASHBOARD_KPI_PERIODS, toIsoDateRange } from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

const inputClass = "h-9 rounded-md border border-border bg-background px-2 text-sm";

const PERIOD_LABELS: Record<DashboardKpiPeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

export function AdminDashboardKpisPanel() {
  const api = useAuthenticatedApi();
  const [period, setPeriod] = useState<DashboardKpiPeriod>("7d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<AdminDashboardKpis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query =
        period === "custom"
          ? buildAdminQuery({
              period,
              from: fromDate ? toIsoDateRange(fromDate, false) : undefined,
              to: toDate ? toIsoDateRange(toDate, true) : undefined,
            })
          : buildAdminQuery({ period });
      const response = await api<AdminDashboardKpis>(`/admin/dashboard/kpis${query}`);
      setKpis(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, [api, period, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminSection
      title="Dashboard KPIs"
      description={kpis ? `${kpis.from} → ${kpis.to}` : PERIOD_LABELS[period]}
      loading={loading}
      error={error}
      empty={!loading && !error && !kpis}
      emptyMessage="No KPI data available yet."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className={inputClass}
          value={period}
          onChange={(event) => setPeriod(event.target.value as DashboardKpiPeriod)}
        >
          {DASHBOARD_KPI_PERIODS.map((value) => (
            <option key={value} value={value}>
              {PERIOD_LABELS[value]}
            </option>
          ))}
        </select>
        {period === "custom" ? (
          <>
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
          </>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Orders" value={String(kpis.ordersCount)} />
          <KpiCard label="Revenue" value={formatPaise(kpis.revenuePaise)} />
          <KpiCard label="Avg order value" value={formatPaise(kpis.averageOrderValuePaise)} />
          <KpiCard label="Customers" value={String(kpis.customersCount)} />
        </div>
      ) : null}
    </AdminSection>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-heading text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function AdminSalesChartPanel() {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<AdminSalesChart | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminSalesChart>(
        "/admin/dashboard/sales-chart?granularity=day",
      );
      setChart(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setChart(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const points = chart?.points ?? [];

  return (
    <AdminSection
      title="Sales chart"
      description={chart ? `Granularity: ${chart.granularity}` : undefined}
      loading={loading}
      error={error}
      empty={!loading && !error && points.length === 0}
      emptyMessage="No chart data available yet."
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

export function AdminTopProductsPanel() {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminTopProducts | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminTopProducts>("/admin/dashboard/top-products?limit=10");
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <AdminSection
      title="Top products"
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No top products available yet."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Qty sold</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.variantId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.variantName}</p>
                </td>
                <td className="px-3 py-2">{item.quantitySold}</td>
                <td className="px-3 py-2">{formatPaise(item.revenuePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}
