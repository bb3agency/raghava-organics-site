"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { AdminShippingSettings } from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";

export function ShippingSettingsPanel() {
  const api = useAuthenticatedApi();
  const [settings, setSettings] = useState<AdminShippingSettings | null>(null);
  const [pickupPincode, setPickupPincode] = useState("");
  const [minOrderValuePaise, setMinOrderValuePaise] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AdminShippingSettings>("/admin/settings/shipping")
      .then((result) => {
        if (!cancelled) {
          setSettings(result);
          setPickupPincode(result.pickupPincode);
          setMinOrderValuePaise(result.minOrderValuePaise);
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
      const updated = await api<AdminShippingSettings>("/admin/settings/shipping", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ pickupPincode, minOrderValuePaise }),
      });
      setSettings(updated);
      setSuccess("Shipping settings updated.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h2 className="font-heading text-xl font-semibold">Shipping settings</h2>
      {settings?.source === 'default' ? (
        <p className="text-xs text-amber-600">
          Using template defaults — save to persist pickup pincode and minimum order value.
        </p>
      ) : settings ? (
        <p className="text-xs text-muted-foreground">Source: {settings.source}</p>
      ) : null}
      <label className="grid gap-1 text-sm">
        Pickup pincode
        <input
          type="text"
          maxLength={6}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={pickupPincode}
          onChange={(event) => setPickupPincode(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Minimum order value (paise)
        <input
          type="number"
          min={0}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={minOrderValuePaise}
          onChange={(event) => setMinOrderValuePaise(Number(event.target.value || 0))}
        />
        <span className="text-xs text-muted-foreground">
          ≈ {formatPaise(minOrderValuePaise)}
        </span>
      </label>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={isSubmitting}
        className="h-10 w-fit rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Save shipping settings"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}
