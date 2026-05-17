import Link from "next/link";
import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminQueuesPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Queues summary"
        endpoint="/admin/queues/dlq/summary"
        emptyMessage="No queue summary available."
      />
      <section className="rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Bull Board</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open the full queue inspection UI exposed by the backend.
        </p>
        <Link className="mt-3 inline-block text-sm underline" href="/api/v1/admin/queues">
          Open /api/v1/admin/queues
        </Link>
      </section>
    </div>
  );
}
