import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminSettingsPatchPanel } from "@/components/admin/AdminSettingsPatchPanel";

export default function AdminInventorySettingsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Inventory settings"
        endpoint="/admin/settings/inventory"
        emptyMessage="Inventory settings unavailable."
      />
      <AdminSettingsPatchPanel
        title="Patch inventory settings"
        endpoint="/admin/settings/inventory"
        defaultPayload='{"defaultLowStockThreshold":5}'
      />
    </div>
  );
}
