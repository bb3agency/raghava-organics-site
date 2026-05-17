import { getOpsMetricsSnapshot } from "@/lib/ops-api";

export default async function OpsMetricsPage() {
  let metrics = "";
  let message: string | null = null;

  try {
    metrics = await getOpsMetricsSnapshot();
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to load metrics snapshot";
  }

  if (message) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {message}
      </p>
    );
  }

  return (
    <section className="grid gap-4">
      <h2 className="font-heading text-xl font-semibold">Ops metrics</h2>
      <p className="text-sm text-muted-foreground">
        Read-only snapshot from <code>/api/v1/ops/metrics</code>.
      </p>
      <pre className="max-h-[36rem] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs">
        {metrics}
      </pre>
    </section>
  );
}
