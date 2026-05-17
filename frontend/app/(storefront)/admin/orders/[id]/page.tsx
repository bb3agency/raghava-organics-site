import { AdminOrderFulfillmentPanel } from "@/components/admin/AdminOrderFulfillmentPanel";

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;

  return (
    <div className="grid gap-6">
      <header className="rounded-lg border border-border p-4">
        <h2 className="font-heading text-xl font-semibold">Order fulfillment</h2>
        <p className="text-sm text-muted-foreground">Order ID: {id}</p>
      </header>
      <AdminOrderFulfillmentPanel key={id} initialOrderId={id} />
    </div>
  );
}
