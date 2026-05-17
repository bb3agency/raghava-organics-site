"use client";

import { useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";

interface AdminSettingsPatchPanelProps {
  title: string;
  endpoint: string;
  defaultPayload: string;
}

export function AdminSettingsPatchPanel({
  title,
  endpoint,
  defaultPayload,
}: AdminSettingsPatchPanelProps) {
  const api = useAuthenticatedApi();
  const [payload, setPayload] = useState(defaultPayload);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    try {
      setLoading(true);
      setError(null);
      const parsed = payload.trim() ? JSON.parse(payload) : {};
      const response = await api(endpoint, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify(parsed),
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">{title}</h3>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        className="min-h-32 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {loading ? "Saving..." : `PATCH ${endpoint}`}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <pre className="max-h-56 overflow-auto rounded bg-muted/40 p-3 text-xs">{result}</pre>
      ) : null}
    </section>
  );
}
