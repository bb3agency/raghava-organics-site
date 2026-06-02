"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { AdminInventorySettings } from "@/lib/admin-api";
import { getApiErrorMessage } from "@/lib/error-messages";

export function InventorySettingsPanel() {
  const api = useAuthenticatedApi();
  const [threshold, setThreshold] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AdminInventorySettings>("/admin/settings/inventory")
      .then((result) => {
        if (!cancelled) {
          setThreshold(result.defaultLowStockThreshold);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function onSave() {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api<AdminInventorySettings>("/admin/settings/inventory", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ defaultLowStockThreshold: threshold }),
      });
      setSuccess("Inventory settings updated.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h2 className="font-heading text-xl font-semibold">Inventory settings</h2>
      {!loaded && !error ? <div className="h-16 animate-pulse rounded-md bg-muted" /> : null}
      <label className="grid gap-1 text-sm">
        Default low-stock threshold
        <input
          type="number"
          min={0}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value || 0))}
        />
      </label>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={isSubmitting}
        className="h-10 w-fit rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Save inventory settings"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}
