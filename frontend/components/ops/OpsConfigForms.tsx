"use client";

import { useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  saveOpsConfigClient,
  validateOpsConfigClient,
  type OpsStoredConfig,
} from "@/lib/ops-client-api";

const SAMPLE_VALUES = '{\n  "RAZORPAY_KEY_ID": "rzp_test_xxx"\n}';

interface OpsConfigFormsProps {
  onConfigSaved?: () => void;
}

export function OpsConfigForms({ onConfigSaved }: OpsConfigFormsProps) {
  const [validateMessage, setValidateMessage] = useState<string | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

  async function handleValidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const domainRaw = String(formData.get("domain") ?? "").trim();
    const values = JSON.parse(String(formData.get("values") ?? "{}")) as Record<
      string,
      string | number | boolean | null
    >;
    setValidateError(null);
    setValidateMessage(null);
    try {
      const result = await validateOpsConfigClient({
        ...(domainRaw
          ? { domain: domainRaw as OpsStoredConfig["items"][number]["domain"] }
          : {}),
        values,
      });
      setValidateMessage(
        result.valid
          ? `Valid. Checked ${result.checkedKeys.length} keys. Restart required: ${result.requiresRestart ? "yes" : "no"}`
          : `Invalid: ${result.errors.map((item) => item.message).join("; ")}`,
      );
    } catch (err) {
      setValidateError(getApiErrorMessageWithHint(err));
    }
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Validate config draft</h3>
        <form onSubmit={handleValidate} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Domain (optional)
            <select
              name="domain"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">all domains</option>
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Values JSON
            <textarea
              name="values"
              minLength={2}
              className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue={SAMPLE_VALUES}
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Validate draft
          </button>
        </form>
        {validateMessage ? <p className="text-sm text-muted-foreground">{validateMessage}</p> : null}
        {validateError ? <p className="text-sm text-destructive">{validateError}</p> : null}
      </div>

      <OpsCriticalOtpForm
        actionType="config-save"
        buttonLabel="Save config (OTP required)"
        onExecute={async ({ challengeId, otpCode }) => {
          const form = document.getElementById("ops-config-save-form") as HTMLFormElement;
          const formData = new FormData(form);
          const domain = String(formData.get("domain") ?? "payments") as OpsStoredConfig["items"][number]["domain"];
          const values = JSON.parse(String(formData.get("values") ?? "{}")) as Record<
            string,
            string | number | boolean | null
          >;
          await saveOpsConfigClient({ domain, values, challengeId, otpCode });
          onConfigSaved?.();
        }}
      >
        <div id="ops-config-save-form" className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Domain
            <select
              name="domain"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              defaultValue="payments"
            >
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Values JSON
            <textarea
              name="values"
              minLength={2}
              className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue={SAMPLE_VALUES}
              required
            />
          </label>
        </div>
      </OpsCriticalOtpForm>
    </section>
  );
}
