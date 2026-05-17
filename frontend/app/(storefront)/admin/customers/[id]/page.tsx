import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

interface AdminCustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCustomerDetailPage({ params }: AdminCustomerDetailPageProps) {
  const { id } = await params;
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Customer detail"
        endpoint={`/admin/users/${id}`}
        emptyMessage="Customer record unavailable."
      />
    </div>
  );
}
