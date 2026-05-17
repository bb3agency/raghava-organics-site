import { getOpsSession, type OpsSession } from "@/lib/ops-api";

export default async function OpsSessionPage() {
  let session: OpsSession | null = null;
  let message: string | null = null;

  try {
    session = await getOpsSession();
  } catch (error) {
    message =
      error instanceof Error
        ? error.message
        : "Ops session unavailable. Configure ops headers in server env.";
  }

  if (!session) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {message}
      </p>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-6">
      <h2 className="font-heading text-xl font-semibold">Session bootstrap</h2>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Ops user</dt>
          <dd>{session.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{session.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">MFA</dt>
          <dd>{session.mfaEnabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Permissions</dt>
          <dd>{session.permissions.join(", ") || "None"}</dd>
        </div>
      </dl>
    </section>
  );
}
