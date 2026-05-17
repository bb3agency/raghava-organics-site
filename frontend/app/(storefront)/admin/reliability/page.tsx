import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { ReliabilityReplayPanel } from "@/components/admin/ReliabilityReplayPanel";
import Link from "next/link";

export default function AdminReliabilityPage() {
  return (
    <div className="grid gap-6">
      <header className="rounded-lg border border-border p-4">
        <h2 className="font-heading text-xl font-semibold">Reliability surfaces</h2>
        <p className="text-sm text-muted-foreground">
          Reconciliation, outbox/inbox replay visibility, analytics, and queue health.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="underline" href="/api/v1/admin/analytics/revenue/export">
            Download revenue CSV
          </Link>
          <Link className="underline" href="/admin/queues">
            Open queues surface
          </Link>
        </div>
      </header>

      <AdminDataPanel
        title="Reconciliation issues"
        endpoint="/admin/analytics/reconciliation-issues"
        emptyMessage="No reconciliation issues currently."
      />

      <AdminDataPanel
        title="Outbox dead-letter list"
        endpoint="/admin/analytics/outbox-dead-letter"
        emptyMessage="No outbox dead-letter messages."
      />

      <AdminDataPanel
        title="Inbox failures"
        endpoint="/admin/analytics/inbox-failures"
        emptyMessage="No inbox failures."
      />

      <AdminDataPanel
        title="Revenue analytics"
        endpoint="/admin/analytics/revenue"
        emptyMessage="No revenue analytics data."
      />

      <AdminDataPanel
        title="Funnel analytics"
        endpoint="/admin/analytics/funnel"
        emptyMessage="No funnel analytics data."
      />

      <AdminDataPanel
        title="Category breakdown"
        endpoint="/admin/analytics/category-breakdown"
        emptyMessage="No category analytics data."
      />

      <AdminDataPanel
        title="Inventory alerts history"
        endpoint="/admin/analytics/inventory-alerts"
        emptyMessage="No inventory alerts."
      />

      <AdminDataPanel
        title="Notification delivery"
        endpoint="/admin/analytics/notifications"
        emptyMessage="No notification analytics data."
      />

      <AdminDataPanel
        title="DLQ summary"
        endpoint="/admin/queues/dlq/summary"
        emptyMessage="No dead-letter queue jobs."
      />
      <ReliabilityReplayPanel />
    </div>
  );
}
