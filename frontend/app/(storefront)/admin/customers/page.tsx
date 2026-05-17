import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminCustomersPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Customer index"
        endpoint="/admin/users?page=1&limit=20"
        emptyMessage="No customer records found."
      />
    </div>
  );
}
