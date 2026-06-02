"use client";

import { useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";

export function ReliabilityReplayPanel() {
  const api = useAuthenticatedApi();
  const [outboxId, setOutboxId] = useState("");
  const [inboxId, setInboxId] = useState("");
  const [reason, setReason] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (endpoint: string, isReplay: boolean) => {
    try {
      setError(null);
      if (isReplay && (reason.trim().length < 8 || !approvalToken.trim())) {
        setError("Replay requires a reason (min 8 chars) and approval token.");
        return;
      }
      const payload = isReplay
        ? { reason: reason.trim(), approvalToken: approvalToken.trim() }
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
    <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer font-medium">Advanced replay (manual IDs)</summary>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
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
          Replay reason (min 8 chars)
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          Approval token
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={approvalToken}
            onChange={(event) => setApprovalToken(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          className="h-10 rounded-md border border-border text-sm"
          onClick={() => void run(`/admin/analytics/outbox-dead-letter/${outboxId}/replay-preview`, false)}
          disabled={!outboxId}
        >
          Outbox replay-preview
        </button>
        <button
          type="button"
          className="h-10 rounded-md bg-primary text-sm text-primary-foreground"
          onClick={() => void run(`/admin/analytics/outbox-dead-letter/${outboxId}/replay`, true)}
          disabled={!outboxId}
        >
          Outbox replay
        </button>
        <button
          type="button"
          className="h-10 rounded-md border border-border text-sm"
          onClick={() => void run(`/admin/analytics/inbox-failures/${inboxId}/replay-preview`, false)}
          disabled={!inboxId}
        >
          Inbox replay-preview
        </button>
        <button
          type="button"
          className="h-10 rounded-md bg-primary text-sm text-primary-foreground"
          onClick={() => void run(`/admin/analytics/inbox-failures/${inboxId}/replay`, true)}
          disabled={!inboxId}
        >
          Inbox replay
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {preview ? (
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">{preview}</pre>
      ) : null}
    </details>
  );
}
