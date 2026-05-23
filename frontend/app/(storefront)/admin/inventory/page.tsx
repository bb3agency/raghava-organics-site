import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminInventoryHistoryPanel } from "@/components/admin/AdminInventoryHistoryPanel";
import { AdminMutationPanel } from "@/components/admin/AdminMutationPanel";

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
      <AdminInventoryHistoryPanel />
      <AdminMutationPanel
        title="Bulk inventory update"
        endpoint="/admin/inventory/bulk-update"
        payloadLabel="Variants (max 100)"
        payloadTemplate={`{\n  "updates": [\n    { "variantId": "VARIANT_ID", "quantity": 10, "expectedVersion": 1 }\n  ]\n}`}
      />
    </div>
  );
}
