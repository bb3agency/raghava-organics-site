"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { AdminStoreProfile } from "@/lib/admin-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { Store, Mail, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export function StoreSettingsPanel() {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.settingsWrite);
  const [form, setForm] = useState<AdminStoreProfile>({
    storeName: "",
    websiteUrl: "",
    logoUrl: "",
    contactEmail: "",
    contactPhone: "",
    gstin: "",
    fssaiNumber: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AdminStoreProfile>("/admin/settings/store")
      .then((result) => {
        if (!cancelled) {
          setForm({
            storeName: result.storeName ?? "",
            websiteUrl: result.websiteUrl ?? "",
            logoUrl: result.logoUrl ?? "",
            contactEmail: result.contactEmail ?? "",
            contactPhone: result.contactPhone ?? "",
            gstin: result.gstin ?? "",
            fssaiNumber: result.fssaiNumber ?? "",
          });
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

  function updateField(key: keyof AdminStoreProfile, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!canWrite) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api<AdminStoreProfile>("/admin/settings/store", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          storeName: form.storeName || undefined,
          websiteUrl: form.websiteUrl || undefined,
          logoUrl: form.logoUrl || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
          gstin: form.gstin || undefined,
          fssaiNumber: form.fssaiNumber || undefined,
        }),
      });
      setSuccess("Store profile updated successfully.");
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
        <h3 className="text-lg font-medium text-foreground">Store Profile</h3>
        <p className="text-sm text-muted-foreground">
          Configure the public business information, contact channels, and compliance registrations for your e-commerce store.
        </p>
      </div>

      {!loaded && !error ? (
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void onSave(); }} className="space-y-6">
          {/* Brand Info */}
          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Store className="h-4 w-4 text-primary" />
              Brand & Online Presence
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Store Name
                <input
                  type="text"
                  required
                  placeholder="e.g. Raghava Organics"
                  className={inputClass}
                  value={form.storeName ?? ""}
                  onChange={(e) => updateField("storeName", e.target.value)}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Website URL
                <input
                  type="url"
                  placeholder="https://www.raghavaorganics.com"
                  className={inputClass}
                  value={form.websiteUrl ?? ""}
                  onChange={(e) => updateField("websiteUrl", e.target.value)}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                Logo Image URL
                <input
                  type="url"
                  placeholder="https://cdn.example.com/logo.png"
                  className={inputClass}
                  value={form.logoUrl ?? ""}
                  onChange={(e) => updateField("logoUrl", e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Support and Contact Details */}
          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Mail className="h-4 w-4 text-primary" />
              Customer Support & Contact
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Support Email
                <input
                  type="email"
                  placeholder="support@raghavaorganics.com"
                  className={inputClass}
                  value={form.contactEmail ?? ""}
                  onChange={(e) => updateField("contactEmail", e.target.value)}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Support Phone Number
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  className={inputClass}
                  value={form.contactPhone ?? ""}
                  onChange={(e) => updateField("contactPhone", e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Compliance Info */}
          <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" />
              Taxation & Compliance IDs
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                GSTIN (Optional)
                <input
                  type="text"
                  placeholder="29AAAAA1111A1Z1"
                  className={inputClass}
                  value={form.gstin ?? ""}
                  onChange={(e) => updateField("gstin", e.target.value.toUpperCase())}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                FSSAI License Number (Optional)
                <input
                  type="text"
                  placeholder="14-digit number"
                  maxLength={14}
                  className={inputClass}
                  value={form.fssaiNumber ?? ""}
                  onChange={(e) => updateField("fssaiNumber", e.target.value.replace(/\D/g, ""))}
                />
              </label>
            </div>
          </div>

          {/* Alert Notification Banners */}
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
              className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-900/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                "Save Store Profile"
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

