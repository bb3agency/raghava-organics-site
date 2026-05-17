import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminSettingsPatchPanel } from "@/components/admin/AdminSettingsPatchPanel";

export default function AdminNotificationsSettingsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Notification settings"
        endpoint="/admin/settings/notifications"
        emptyMessage="Notification settings unavailable."
      />
      <AdminSettingsPatchPanel
        title="Patch notification settings"
        endpoint="/admin/settings/notifications"
        defaultPayload='{"emailEnabled":true,"smsEnabled":false,"whatsappEnabled":false}'
      />
    </div>
  );
}
