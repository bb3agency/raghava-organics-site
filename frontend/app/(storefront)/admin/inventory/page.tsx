import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminInventoryPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Inventory list"
        endpoint="/admin/inventory?page=1&limit=20"
        emptyMessage="No inventory rows found."
      />
      <AdminDataPanel
        title="Low stock alerts"
        endpoint="/admin/inventory/low-stock"
        emptyMessage="No low-stock alerts."
      />
    </div>
  );
}
