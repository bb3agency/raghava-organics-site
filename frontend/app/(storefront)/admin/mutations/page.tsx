import { AdminOrderMutations } from "@/components/admin/AdminOrderMutations";

export default function AdminMutationsPage() {
  return (
    <div className="grid gap-6">
      <header className="grid gap-2 rounded-lg border border-border p-4">
        <h2 className="font-heading text-xl font-semibold">Order fulfillment</h2>
        <p className="text-sm text-muted-foreground">
          Ship via Shiprocket (book AWB → schedule pickup → print label). COD payment
          capture follows delivery webhooks — not a manual admin action. High-risk writes
          use `idempotency-key`; refunds are asynchronous.
        </p>
      </header>
      <AdminOrderMutations />

      <div className="rounded-lg border border-border p-4">
        <h3 className="font-medium">Dry-run checklist</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Razorpay test key present in `frontend/.env.local`.</li>
          <li>Provider dry-runs logged in credential register document.</li>
          <li>COD path validated without invoking Razorpay modal.</li>
          <li>Idempotency conflict handling (`409`) verified on repeated submissions.</li>
        </ul>
      </div>
    </div>
  );
}
