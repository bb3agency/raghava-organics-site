"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { AdminStoreProfile } from "@/lib/admin-api";
import { getApiErrorMessage } from "@/lib/error-messages";

export function StoreSettingsPanel() {
  const api = useAuthenticatedApi();
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
      setSuccess("Store profile updated.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields: Array<{ key: keyof AdminStoreProfile; label: string }> = [
    { key: "storeName", label: "Store name" },
    { key: "websiteUrl", label: "Website URL" },
    { key: "logoUrl", label: "Logo URL" },
    { key: "contactEmail", label: "Contact email" },
    { key: "contactPhone", label: "Contact phone" },
    { key: "gstin", label: "GSTIN" },
    { key: "fssaiNumber", label: "FSSAI number" },
  ];

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h2 className="font-heading text-xl font-semibold">Store profile</h2>
      {!loaded && !error ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : null}
      {fields.map(({ key, label }) => (
        <label key={key} className="grid gap-1 text-sm">
          {label}
          <input
            type="text"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={form[key] ?? ""}
            onChange={(event) => updateField(key, event.target.value)}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={isSubmitting}
        className="h-10 w-fit rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Save store profile"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}
