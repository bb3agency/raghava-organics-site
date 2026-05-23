"use client";

import { useEffect, useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  getOpsLoadShedStatusClient,
  setOpsLoadShedMode,
  type OpsLoadShedStatus,
} from "@/lib/ops-client-api";

export function OpsLoadShedPanel() {
  const [mode, setMode] = useState<OpsLoadShedStatus["mode"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOpsLoadShedStatusClient()
      .then((status) => setMode(status.mode))
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, []);

  return (
    <section className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Load-shed control</h2>
        <p className="text-sm text-muted-foreground">
          Single-step change after email OTP. Applies immediately when verified.
        </p>
      </header>

      {mode ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          Current mode: <span className="font-medium">{mode}</span>
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <OpsCriticalOtpForm
        actionType="load-shed-change"
        buttonLabel="Apply load-shed mode"
        onExecute={async ({ challengeId, otpCode }) => {
          const form = document.getElementById("load-shed-form") as HTMLFormElement | null;
          const formData = form ? new FormData(form) : null;
          const nextMode = String(formData?.get("mode") ?? "reduced") as OpsLoadShedStatus["mode"];
          const reason = String(formData?.get("reason") ?? "").trim();
          const result = await setOpsLoadShedMode({
            mode: nextMode,
            reason,
            challengeId,
            otpCode,
          });
          setMode(result.mode);
        }}
      >
        <div id="load-shed-form" className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Mode
            <select
              name="mode"
              defaultValue="reduced"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="normal">normal</option>
              <option value="reduced">reduced</option>
              <option value="emergency">emergency</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Reason (min 10 chars)
            <textarea
              name="reason"
              minLength={10}
              required
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Explain why this mode change is needed..."
            />
          </label>
        </div>
      </OpsCriticalOtpForm>
    </section>
  );
}
