import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminPaymentsPage() {
  return (
    <AdminDataPanel
      title="Global payments"
      endpoint="/admin/payments?page=1&limit=50"
      emptyMessage="No payments found."
    />
  );
}
