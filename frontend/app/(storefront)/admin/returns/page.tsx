import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminReturnRequestActions } from "@/components/admin/AdminReturnRequestActions";

export default function AdminReturnsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Return requests"
        endpoint="/admin/return-requests?page=1&limit=20"
        emptyMessage="No return requests found."
      />
      <AdminReturnRequestActions />
    </div>
  );
}
