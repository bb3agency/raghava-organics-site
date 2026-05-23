"use client";

import { useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";

export function AdminInventoryHistoryPanel() {
  const api = useAuthenticatedApi();
  const [variantId, setVariantId] = useState("");
  const [history, setHistory] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">Adjustment history by variant</h3>
      <div className="flex flex-wrap gap-2">
        <input
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          placeholder="Variant ID"
          className="h-10 min-w-64 flex-1 rounded-md border px-3 text-sm"
        />
        <button
          type="button"
          className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground"
          onClick={() => {
            void api(`/admin/inventory/history/${variantId}`)
              .then(setHistory)
              .catch((err) => setError(getApiErrorMessageWithHint(err)));
          }}
        >
          Load history
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {history ? (
        <pre className="max-h-64 overflow-auto rounded-md border p-3 text-xs">
          {JSON.stringify(history, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
