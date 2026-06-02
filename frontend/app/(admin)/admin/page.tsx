import {
  AdminDashboardKpisPanel,
  AdminSalesChartPanel,
  AdminTopProductsPanel,
} from "@/components/admin/AdminDashboardPanels";

export default function AdminDashboardPage() {
  return (
    <div className="grid gap-6">
      <AdminDashboardKpisPanel />
      <AdminSalesChartPanel />
      <AdminTopProductsPanel />
    </div>
  );
}
