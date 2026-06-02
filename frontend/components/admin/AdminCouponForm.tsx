"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import type {
  AdminCouponListItem,
  AdminCreateCouponInput,
  AdminUpdateCouponInput,
} from "@/lib/admin-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalDatetimeValue(value: string): string {
  return new Date(value).toISOString();
}

interface AdminCouponFormProps {
  coupon?: AdminCouponListItem | null;
  onSaved: () => void;
  onCancel?: () => void;
}

export function AdminCouponForm({ coupon, onSaved, onCancel }: AdminCouponFormProps) {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.couponsWrite);
  const isEdit = Boolean(coupon);

  const [code, setCode] = useState("");
  const [type, setType] = useState<AdminCreateCouponInput["type"]>("PERCENTAGE_OFF");
  const [value, setValue] = useState("");
  const [minOrderPaise, setMinOrderPaise] = useState("0");
  const [maxUsesTotal, setMaxUsesTotal] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (coupon) {
      setCode(coupon.code);
      setType(coupon.type as AdminCreateCouponInput["type"]);
      setValue(String(coupon.value));
      setMinOrderPaise(String(coupon.minOrderPaise));
      setMaxUsesTotal(coupon.maxUsesTotal ? String(coupon.maxUsesTotal) : "");
      setMaxUsesPerUser(coupon.maxUsesPerUser ? String(coupon.maxUsesPerUser) : "");
      setValidFrom(toLocalDatetimeValue(coupon.validFrom));
      setValidUntil(toLocalDatetimeValue(coupon.validUntil));
      setIsActive(coupon.isActive);
    } else {
      setValidFrom(toLocalDatetimeValue(new Date().toISOString()));
    }
  }, [coupon]);

  if (!canWrite) return null;

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && coupon) {
        const payload: AdminUpdateCouponInput = {
          code: code.trim().toUpperCase(),
          type,
          value: Number(value),
          minOrderPaise: Number(minOrderPaise),
          maxUsesTotal: maxUsesTotal.trim() ? Number(maxUsesTotal) : undefined,
          maxUsesPerUser: maxUsesPerUser.trim() ? Number(maxUsesPerUser) : null,
          validFrom: validFrom ? fromLocalDatetimeValue(validFrom) : undefined,
          validUntil: validUntil ? fromLocalDatetimeValue(validUntil) : null,
          isActive,
        };
        await api(`/admin/coupons/${coupon.id}`, {
          method: "PATCH",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify(payload),
        });
      } else {
        const payload: AdminCreateCouponInput = {
          code: code.trim().toUpperCase(),
          type,
          value: Number(value),
          validFrom: fromLocalDatetimeValue(validFrom),
          minOrderPaise: Number(minOrderPaise),
          ...(maxUsesTotal.trim() ? { maxUsesTotal: Number(maxUsesTotal) } : {}),
          ...(maxUsesPerUser.trim() ? { maxUsesPerUser: Number(maxUsesPerUser) } : {}),
          ...(validUntil ? { validUntil: fromLocalDatetimeValue(validUntil) } : {}),
          isActive,
        };
        await api("/admin/coupons", {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSection
      title={isEdit ? `Edit coupon ${coupon?.code}` : "Create coupon"}
      description="Discount codes aligned to backend coupon schema."
      actions={
        onCancel ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Code
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Type
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as AdminCreateCouponInput["type"])}
          >
            <option value="PERCENTAGE_OFF">Percentage off</option>
            <option value="FLAT_AMOUNT_OFF">Flat amount (paise)</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Value {type === "PERCENTAGE_OFF" ? "(%)" : "(paise)"}
          <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Min order (paise)
          <input
            className={inputClass}
            value={minOrderPaise}
            onChange={(e) => setMinOrderPaise(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Max uses total
          <input
            className={inputClass}
            value={maxUsesTotal}
            onChange={(e) => setMaxUsesTotal(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Max uses per user
          <input
            className={inputClass}
            value={maxUsesPerUser}
            onChange={(e) => setMaxUsesPerUser(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Valid from
          <input
            type="datetime-local"
            className={inputClass}
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Valid until
          <input
            type="datetime-local"
            className={inputClass}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>
      <button
        type="button"
        className="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={saving || !code.trim() || !validFrom}
        onClick={() => void onSubmit()}
      >
        {saving ? "Saving…" : isEdit ? "Update coupon" : "Create coupon"}
      </button>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </AdminSection>
  );
}
