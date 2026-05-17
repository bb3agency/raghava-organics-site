import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminSettingsPatchPanel } from "@/components/admin/AdminSettingsPatchPanel";

export default function AdminStoreSettingsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Store settings"
        endpoint="/admin/settings/store"
        emptyMessage="Store settings unavailable."
      />
      <AdminSettingsPatchPanel
        title="Patch store settings"
        endpoint="/admin/settings/store"
        defaultPayload='{"storeName":"Raghava Organics","supportEmail":"support@example.com"}'
      />
    </div>
  );
}
