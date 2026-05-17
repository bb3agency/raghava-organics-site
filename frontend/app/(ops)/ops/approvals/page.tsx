import { getOpsApprovals, type OpsApprovalList } from "@/lib/ops-api";

export default async function OpsApprovalsPage() {
  let data: OpsApprovalList | null = null;
  let message = "Unable to load approvals queue";

  try {
    data = await getOpsApprovals();
  } catch (error) {
    message = error instanceof Error ? error.message : message;
  }

  if (!data) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {message}
      </p>
    );
  }

  return (
    <section className="grid gap-4">
      <h2 className="font-heading text-xl font-semibold">Approvals queue</h2>
      <p className="text-sm text-muted-foreground">
        {data.total} requests · page {data.page}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Request ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Requester</th>
              <th className="px-3 py-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.requestId} className="border-t border-border">
                <td className="px-3 py-2">{item.requestId}</td>
                <td className="px-3 py-2">{item.status}</td>
                <td className="px-3 py-2">{item.requesterId}</td>
                <td className="px-3 py-2">{item.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
