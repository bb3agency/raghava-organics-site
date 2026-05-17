import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminOrderBoardPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Order board"
        endpoint="/admin/orders/board?page=1&limit=30"
        emptyMessage="No board data found."
      />
    </div>
  );
}
