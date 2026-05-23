"use client";

import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { scheduleOpsSystemRestart } from "@/lib/ops-client-api";

export function OpsSystemPanel() {
  return (
    <section className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Schedules API/worker restart. Backend auto-sets load-shed emergency until restart completes.
      </p>
      <OpsCriticalOtpForm
        actionType="system-restart"
        buttonLabel="Schedule restart"
        onExecute={async ({ challengeId, otpCode }) => {
          const delayMinutes = Number(
            (document.getElementById("restart-delay") as HTMLInputElement | null)?.value ?? "5",
          );
          await scheduleOpsSystemRestart({ delayMinutes, challengeId, otpCode });
        }}
      >
        <label className="grid gap-1 text-sm">
          Delay (minutes)
          <input
            id="restart-delay"
            type="number"
            min={1}
            max={60}
            defaultValue={5}
            className="h-10 rounded-md border px-3 text-sm"
          />
        </label>
      </OpsCriticalOtpForm>
    </section>
  );
}
