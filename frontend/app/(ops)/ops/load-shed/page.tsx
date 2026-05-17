import {
  confirmLoadShedAction,
  rejectLoadShedAction,
  requestLoadShedAction,
} from "@/actions/ops.actions";
import { getOpsLoadShedStatus } from "@/lib/ops-api";

export default async function LoadShedPage() {
  let currentMode: string | null = null;
  let fetchError: string | null = null;

  try {
    const status = await getOpsLoadShedStatus();
    currentMode = status.mode;
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Unable to fetch mode";
  }

  return (
    <section className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Load-shed control</h2>
        <p className="text-sm text-muted-foreground">
          Two-step flow: request mode change, then explicit confirm/reject.
        </p>
      </header>

      {currentMode ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          Current mode: <span className="font-medium">{currentMode}</span>
        </p>
      ) : fetchError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {fetchError}
        </p>
      ) : null}

      <form action={requestLoadShedAction} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">1) Request change</h3>
        <label className="grid gap-1 text-sm">
          Mode
          <select
            name="mode"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            defaultValue="reduced"
          >
            <option value="normal">normal</option>
            <option value="reduced">reduced</option>
            <option value="emergency">emergency</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Reason
          <textarea
            name="reason"
            minLength={10}
            className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Explain why this mode change is needed..."
            required
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Create approval request
        </button>
      </form>

      <form action={confirmLoadShedAction} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">2) Confirm request</h3>
        <input
          name="requestId"
          placeholder="Request ID"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white"
        >
          Confirm
        </button>
      </form>

      <form action={rejectLoadShedAction} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">2) Reject request</h3>
        <input
          name="requestId"
          placeholder="Request ID"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
        <textarea
          name="reason"
          minLength={10}
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Reason for rejection..."
          required
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground"
        >
          Reject
        </button>
      </form>
    </section>
  );
}
