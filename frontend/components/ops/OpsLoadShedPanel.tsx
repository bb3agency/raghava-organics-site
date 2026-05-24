"use client";

import { useEffect, useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { OpsAlert, OpsBadge, OpsCard, OpsField, OpsLoadingBlock, OpsSelect, OpsTextarea } from "@/components/ops/ui/ops-ui";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { loadShedBadgeTone } from "@/lib/ops-status-maps";
import {
  getOpsLoadShedStatusClient,
  setOpsLoadShedMode,
  type OpsLoadShedStatus,
} from "@/lib/ops-client-api";
import { useOpsCanWrite } from "@/components/ops/OpsSessionProvider";

export function OpsLoadShedPanel() {
  const canWrite = useOpsCanWrite();
  const [mode, setMode] = useState<OpsLoadShedStatus["mode"] | null>(null);
  const [targetMode, setTargetMode] = useState<OpsLoadShedStatus["mode"]>("reduced");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getOpsLoadShedStatusClient()
      .then((status) => {
        setMode(status.mode);
        setError(null);
      })
      .catch((err) => setError(getApiErrorMessageWithHint(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <OpsLoadingBlock label="Fetching load-shed status…" />;
  }

  return (
    <div className="grid gap-6">
      {error ? <OpsAlert tone="error">{error}</OpsAlert> : null}
      {mode ? (
        <OpsCard padding="md" className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current runtime mode</p>
            <p className="font-heading mt-1 text-2xl font-semibold capitalize">{mode}</p>
          </div>
          <OpsBadge tone={loadShedBadgeTone(mode)}>{mode}</OpsBadge>
        </OpsCard>
      ) : null}

      {!canWrite ? (
        <OpsAlert tone="warning">You have read-only access. Load-shed changes require ops:write.</OpsAlert>
      ) : (
        <OpsCriticalOtpForm
          actionType="load-shed-change"
          title="Change load-shed mode"
          description="Applies immediately after OTP verification. Use emergency only when the platform is under severe pressure."
          buttonLabel="Apply mode change"
          onExecute={async ({ challengeId, otpCode }) => {
            const trimmedReason = reason.trim();
            if (trimmedReason.length < 10) {
              throw new Error("Reason must be at least 10 characters.");
            }
            const result = await setOpsLoadShedMode({
              mode: targetMode,
              reason: trimmedReason,
              challengeId,
              otpCode,
            });
            setMode(result.mode);
          }}
        >
          <div className="grid gap-4">
            <OpsField label="Target mode" htmlFor="load-shed-mode">
              <OpsSelect
                id="load-shed-mode"
                name="mode"
                value={targetMode}
                onChange={(event) => {
                  setTargetMode(event.target.value as OpsLoadShedStatus["mode"]);
                }}
              >
                <option value="normal">Normal — full traffic</option>
                <option value="reduced">Reduced — defer non-critical work</option>
                <option value="emergency">Emergency — strict protection</option>
              </OpsSelect>
            </OpsField>
            <OpsField label="Reason" htmlFor="load-shed-reason" hint="Minimum 10 characters for audit">
              <OpsTextarea
                id="load-shed-reason"
                name="reason"
                minLength={10}
                required
                placeholder="Describe why this mode change is required…"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </OpsField>
          </div>
        </OpsCriticalOtpForm>
      )}
    </div>
  );
}
