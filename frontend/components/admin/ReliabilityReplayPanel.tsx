"use client";

import { useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";

export function ReliabilityReplayPanel() {
  const api = useAuthenticatedApi();
  const [outboxId, setOutboxId] = useState("");
  const [inboxId, setInboxId] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (endpoint: string) => {
    try {
      setError(null);
      const payload = approvalToken.trim()
        ? { approvalToken: approvalToken.trim() }
        : {};
      const result = await api<unknown>(endpoint, {
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify(payload),
      });
      setPreview(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    }
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h3 className="font-medium">Replay preview / replay</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Outbox dead-letter ID
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={outboxId}
            onChange={(event) => setOutboxId(event.target.value)}
            placeholder="outbox_message_id"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Inbox failure ID
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={inboxId}
            onChange={(event) => setInboxId(event.target.value)}
            placeholder="inbox_event_id"
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          Approval token (optional)
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={approvalToken}
            onChange={(event) => setApprovalToken(event.target.value)}
            placeholder="approval token when replay approval is enforced"
          />
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <button
          type="button"
          className="h-10 rounded-md border border-border text-sm"
          onClick={() => run(`/admin/analytics/outbox-dead-letter/${outboxId}/replay-preview`)}
          disabled={!outboxId}
        >
          Outbox replay-preview
        </button>
        <button
          type="button"
          className="h-10 rounded-md bg-primary text-sm text-primary-foreground"
          onClick={() => run(`/admin/analytics/outbox-dead-letter/${outboxId}/replay`)}
          disabled={!outboxId}
        >
          Outbox replay
        </button>
        <button
          type="button"
          className="h-10 rounded-md border border-border text-sm"
          onClick={() => run(`/admin/analytics/inbox-failures/${inboxId}/replay-preview`)}
          disabled={!inboxId}
        >
          Inbox replay-preview
        </button>
        <button
          type="button"
          className="h-10 rounded-md bg-primary text-sm text-primary-foreground"
          onClick={() => run(`/admin/analytics/inbox-failures/${inboxId}/replay`)}
          disabled={!inboxId}
        >
          Inbox replay
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {preview ? (
        <pre className="max-h-56 overflow-auto rounded bg-muted/40 p-3 text-xs">{preview}</pre>
      ) : null}
    </section>
  );
}
