import {
  cleanupOpsInvitesAction,
  createOpsInviteAction,
} from "@/actions/ops.actions";

export default function OpsInvitesPage() {
  return (
    <section className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Ops invites</h2>
        <p className="text-sm text-muted-foreground">
          Issue ops onboarding links and cleanup expired invites.
        </p>
      </header>

      <form action={createOpsInviteAction} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Create invite</h3>
        <label className="grid gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Name
          <input
            name="name"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          setupBaseUrl
          <input
            name="setupBaseUrl"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            placeholder="https://client.example.com"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Permissions (comma-separated OPS_READ,OPS_WRITE,OPS_APPROVE)
          <input
            name="permissions"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            defaultValue="OPS_READ,OPS_WRITE"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          IP allowlist CIDRs (comma-separated)
          <input
            name="ipAllowlist"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            placeholder="203.0.113.10/32"
            required
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Create invite
        </button>
      </form>

      <form action={cleanupOpsInvitesAction} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Cleanup expired invites</h3>
        <p className="text-sm text-muted-foreground">
          Runs `POST /api/v1/ops/invites/cleanup-expired` for housekeeping.
        </p>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Cleanup now
        </button>
      </form>
    </section>
  );
}
