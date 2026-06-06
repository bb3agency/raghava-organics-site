"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessage } from "@/lib/error-messages";
import { Banknote, Clock, MapPin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface CodSettings {
  isCodEnabled: boolean;
  cancellationWindowHours: number;
  sellerState: string | null;
}

export function CodSettingsPanel() {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.settingsWrite);
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
    if (!canWrite) return;
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
      setSuccess("Cash on Delivery settings updated successfully.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "block w-full max-w-md rounded-lg border border-border bg-background/50 px-3.5 py-2 text-sm text-foreground placeholder-muted-foreground/60 transition-all focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus:outline-hidden disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground">Cash on Delivery (COD) Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure COD availability, customer cancellation policies, and regional rules.
        </p>
      </div>

      {!settings && !error ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void onSave(); }} className="space-y-6">
          
          {/* Enable/Disable Card */}
          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Banknote className="h-4 w-4 text-primary" />
              Availability Check
            </h4>
            
            <label className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-4 transition-all hover:bg-background cursor-pointer">
              <input
                type="checkbox"
                checked={isCodEnabled}
                onChange={(event) => setIsCodEnabled(event.target.checked)}
                className="mt-1 h-4.5 w-4.5 rounded-sm border-border text-primary focus:ring-primary/20"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-foreground">
                  Accept Cash on Delivery Orders
                </span>
                <p className="text-xs text-muted-foreground">
                  Allow customers to choose cash/pay on delivery during checkout. If disabled, only prepaid options will be shown.
                </p>
              </div>
            </label>
          </div>

          {/* Configuration Card */}
          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-5">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Policies & Restrictions
            </h4>

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Cancellation Window (Hours)
                <div className="relative max-w-md">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    required
                    placeholder="24"
                    className={`${inputClass} pr-14`}
                    value={cancellationWindowHours}
                    onChange={(event) => setCancellationWindowHours(Number(event.target.value || 1))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">
                    hours
                  </span>
                </div>
                <span className="text-xs text-muted-foreground/80">
                  Allow customers to cancel COD orders from their portal within this window.
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Seller Operating State (Optional)
                </div>
                <input
                  type="text"
                  placeholder="e.g. Karnataka"
                  className={inputClass}
                  value={sellerState}
                  onChange={(event) => setSellerState(event.target.value)}
                />
                <span className="text-xs text-muted-foreground/80">
                  Specifying your operating state helps calculate regional taxes/rules for self-shipping/COD.
                </span>
              </label>
            </div>
          </div>

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
          <div className="flex justify-start pt-2 border-t border-border">
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
                "Save COD Settings"
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

