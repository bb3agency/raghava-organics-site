"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessage } from "@/lib/error-messages";

interface CodSettings {
  isCodEnabled: boolean;
  cancellationWindowHours: number;
  sellerState: string | null;
}

export function CodSettingsPanel() {
  const api = useAuthenticatedApi();
  const [settings, setSettings] = useState<CodSettings | null>(null);
  const [isCodEnabled, setIsCodEnabled] = useState(true);
  const [cancellationWindowHours, setCancellationWindowHours] = useState(24);
  const [sellerState, setSellerState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api<CodSettings>("/admin/settings/cod");
        if (cancelled) {
          return;
        }
        setSettings(result);
        setIsCodEnabled(result.isCodEnabled);
        setCancellationWindowHours(result.cancellationWindowHours);
        setSellerState(result.sellerState ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const onSave = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);
      const payload = {
        isCodEnabled,
        cancellationWindowHours,
        sellerState: sellerState.trim() ? sellerState.trim() : null,
      };
      const updated = await api<CodSettings>("/admin/settings/cod", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify(payload),
      });
      setSettings(updated);
      setSuccess("COD settings updated.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h2 className="font-heading text-xl font-semibold">COD settings</h2>
      {!settings && !error ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isCodEnabled}
          onChange={(event) => setIsCodEnabled(event.target.checked)}
        />
        Enable Cash on Delivery
      </label>
      <label className="grid gap-1 text-sm">
        Cancellation window (hours)
        <input
          type="number"
          min={1}
          max={720}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={cancellationWindowHours}
          onChange={(event) =>
            setCancellationWindowHours(Number(event.target.value || 1))
          }
        />
      </label>
      <label className="grid gap-1 text-sm">
        Seller state (optional)
        <input
          type="text"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={sellerState}
          onChange={(event) => setSellerState(event.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        disabled={isSubmitting}
        className="h-10 justify-self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : "Save COD settings"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}
