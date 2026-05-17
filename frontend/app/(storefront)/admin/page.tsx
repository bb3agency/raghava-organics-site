import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminDashboardPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Dashboard KPIs"
        endpoint="/admin/dashboard/kpis"
        emptyMessage="No KPI rows available yet."
      />
      <AdminDataPanel
        title="Sales chart"
        endpoint="/admin/dashboard/sales-chart"
        emptyMessage="No chart data available yet."
      />
      <AdminDataPanel
        title="Top products"
        endpoint="/admin/dashboard/top-products"
        emptyMessage="No top products available yet."
      />
    </div>
  );
}
