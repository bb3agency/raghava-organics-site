import { getOpsAuditLogs, type OpsAuditList } from "@/lib/ops-api";

export default async function OpsAuditPage() {
  let data: OpsAuditList | null = null;
  let message = "Unable to load ops audit logs";

  try {
    data = await getOpsAuditLogs({ page: 1, limit: 20 });
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
      <h2 className="font-heading text-xl font-semibold">Audit timeline</h2>
      <p className="text-sm text-muted-foreground">
        {data.total} events · page {data.page}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2">{item.createdAt}</td>
                <td className="px-3 py-2">{item.actionStatus}</td>
                <td className="px-3 py-2">{item.method}</td>
                <td className="px-3 py-2">{item.requestPath}</td>
                <td className="px-3 py-2">{item.requestId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
