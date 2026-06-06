"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { AdminShippingSettings } from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { Truck, MapPin, BadgePercent, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export function ShippingSettingsPanel() {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.settingsWrite);
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
    if (!canWrite) return;
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
      setSuccess("Shipping settings updated successfully.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "block w-full rounded-lg border border-border bg-background/50 px-3.5 py-2 text-sm text-foreground placeholder-muted-foreground/60 transition-all focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus:outline-hidden disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground">Shipping Settings</h3>
        <p className="text-sm text-muted-foreground">
          Manage fulfillment parameters including the origin pickup pincode and free/minimum order value thresholds.
        </p>
      </div>

      {!settings && !error ? (
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void onSave(); }} className="space-y-6">
          {settings?.source === "default" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Using default placeholder values. Save custom shipping configuration to persist settings.</span>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Truck className="h-4 w-4 text-primary" />
              Fulfillment & Delivery Origin
            </h4>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Pickup Pincode (Origin Pincode)
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground/60 select-none">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    placeholder="e.g. 560001"
                    className={`${inputClass} pl-10`}
                    value={pickupPincode}
                    onChange={(event) => setPickupPincode(event.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <span className="text-xs text-muted-foreground/80">
                  Used by shipping integrations to calculate dynamic courier charges from your warehouse/store.
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Minimum Order Value (in Paise)
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground/60 select-none">
                    <BadgePercent className="h-4 w-4" />
                  </span>
                  <input
                    type="number"
                    min={0}
                    required
                    placeholder="50000 (for ₹500.00)"
                    className={`${inputClass} pl-10`}
                    value={minOrderValuePaise || ""}
                    onChange={(event) => setMinOrderValuePaise(Number(event.target.value || 0))}
                  />
                </div>
                <span className="text-xs font-semibold text-zinc-800 mt-0.5">
                  Equivalent: {formatPaise(minOrderValuePaise)}
                </span>
              </label>
            </div>
          </div>

          {settings?.source && settings.source !== "default" && (
            <div className="text-xs text-muted-foreground px-1">
              Configuration Active Source: <span className="font-semibold text-foreground uppercase">{settings.source}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2.5 rounded-lg border border-zinc-900/20 bg-zinc-900/10 p-3.5 text-xs text-zinc-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              type="submit"
              disabled={isSubmitting || !canWrite}
              title={!canWrite ? "Requires settings:write permission" : undefined}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/95 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                "Save Shipping Settings"
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

