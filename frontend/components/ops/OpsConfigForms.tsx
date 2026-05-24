"use client";

import { useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { useOpsCanWrite } from "@/components/ops/OpsSessionProvider";
import {
  OpsAlert,
  OpsCard,
  OpsCardHeader,
  OpsField,
  OpsSelect,
  OpsTextarea,
} from "@/components/ops/ui/ops-ui";
import { Button } from "@/components/ui/button";
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
  const canWrite = useOpsCanWrite();
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
          ? `Valid — checked ${result.checkedKeys.length} keys. Restart required: ${result.requiresRestart ? "yes" : "no"}`
          : `Invalid: ${result.errors.map((item) => item.message).join("; ")}`,
      );
    } catch (err) {
      setValidateError(getApiErrorMessageWithHint(err));
    }
  }

  if (!canWrite) {
    return (
      <OpsAlert tone="warning">Read-only session — config validate/save requires ops:write.</OpsAlert>
    );
  }

  return (
    <div className="grid gap-6">
      <OpsCard>
        <OpsCardHeader
          title="Validate draft"
          description="Dry-run against the ops config contract before OTP save."
        />
        <form onSubmit={handleValidate} className="grid gap-4">
          <OpsField label="Domain (optional)" htmlFor="validate-domain">
            <OpsSelect id="validate-domain" name="domain" defaultValue="">
              <option value="">All domains</option>
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </OpsSelect>
          </OpsField>
          <OpsField label="Values (JSON)" htmlFor="validate-values" hint="Keys must match contract for selected domain">
            <OpsTextarea id="validate-values" name="values" defaultValue={SAMPLE_VALUES} required className="min-h-32 font-mono text-xs" />
          </OpsField>
          <Button type="submit" className="w-fit">
            Validate draft
          </Button>
        </form>
        {validateMessage ? <OpsAlert tone="success" className="mt-4">{validateMessage}</OpsAlert> : null}
        {validateError ? <OpsAlert tone="error" className="mt-4">{validateError}</OpsAlert> : null}
      </OpsCard>

      <OpsCriticalOtpForm
        actionType="config-save"
        title="Save configuration"
        description="Persists encrypted values to OpsConfigSecret. Restart API and workers when requiresRestart is true."
        buttonLabel="Save with OTP"
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
        <div id="ops-config-save-form" className="grid gap-4">
          <OpsField label="Domain" htmlFor="save-domain">
            <OpsSelect id="save-domain" name="domain" defaultValue="payments">
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </OpsSelect>
          </OpsField>
          <OpsField label="Values (JSON)" htmlFor="save-values">
            <OpsTextarea id="save-values" name="values" defaultValue={SAMPLE_VALUES} required className="min-h-32 font-mono text-xs" />
          </OpsField>
        </div>
      </OpsCriticalOtpForm>
    </div>
  );
}
