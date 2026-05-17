import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminSettingsPatchPanel } from "@/components/admin/AdminSettingsPatchPanel";

export default function AdminShippingSettingsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Shipping settings"
        endpoint="/admin/settings/shipping"
        emptyMessage="Shipping settings unavailable."
      />
      <AdminSettingsPatchPanel
        title="Patch shipping settings"
        endpoint="/admin/settings/shipping"
        defaultPayload='{"minimumOrderValue": 0, "pickupPincode": "560001"}'
      />
    </div>
  );
}
