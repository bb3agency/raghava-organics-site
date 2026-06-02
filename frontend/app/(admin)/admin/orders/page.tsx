import { AdminOrdersList } from "@/components/admin/AdminOrdersList";
import Link from "next/link";

export default function AdminOrdersPage() {
  return (
    <div className="grid gap-6">
      <header className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-heading text-xl font-semibold">Orders</h2>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/orders/board" className="text-primary hover:underline">
            Open order board
          </Link>
        </div>
      </header>
      <AdminOrdersList />
    </div>
  );
}
