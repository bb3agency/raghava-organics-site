import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminShipmentsPage() {
  return (
    <AdminDataPanel
      title="Global shipments"
      endpoint="/admin/shipments?page=1&limit=50"
      emptyMessage="No shipments found."
    />
  );
}
