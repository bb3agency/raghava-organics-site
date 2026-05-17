import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import Link from "next/link";

export default function AdminOrdersPage() {
  return (
    <div className="grid gap-6">
      <header className="rounded-lg border border-border p-4">
        <h2 className="font-heading text-xl font-semibold">Orders</h2>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/orders/board" className="underline">
            Open order board snapshot
          </Link>
          <Link href="/api/v1/admin/orders/export?page=1&limit=50" className="underline">
            Download orders CSV
          </Link>
        </div>
      </header>
      <AdminDataPanel
        title="Orders list"
        endpoint="/admin/orders?page=1&limit=20"
        emptyMessage="No orders found."
      />
    </div>
  );
}
