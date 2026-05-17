"use client";

import { useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessage } from "@/lib/error-messages";

export function AdminReturnRequestActions() {
  const api = useAuthenticatedApi();
  const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState("APPROVED");
  const [adminNote, setAdminNote] = useState("Reviewed by admin");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (!requestId.trim()) {
      setError("Return request ID is required.");
      return;
    }
    try {
      setError(null);
      const response = await api(`/admin/return-requests/${requestId}`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ status, adminNote }),
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">Update return request</h3>
      <label className="grid gap-1 text-sm">
        Return request ID
        <input
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Status
        <input
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Admin note
        <textarea
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        PATCH return request
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <pre className="max-h-56 overflow-auto rounded bg-muted/40 p-3 text-xs">{result}</pre>
      ) : null}
    </section>
  );
}
