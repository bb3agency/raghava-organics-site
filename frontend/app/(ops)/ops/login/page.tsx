"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { OpsPublicLayout } from "@/components/ops/OpsPublicLayout";
import { OpsAlert, OpsCard, OpsField, OpsInput } from "@/components/ops/ui/ops-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/error-messages";
import { requestOpsLoginOtp, verifyOpsLoginOtp } from "@/lib/ops-client-api";
import { emailSchema, otpSchema } from "@/lib/validators";

const emailStepSchema = z.object({
  email: emailSchema,
});

export default function OpsLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const form = useForm<z.infer<typeof emailStepSchema>>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: "" },
  });

  const handleRequestOtp = form.handleSubmit(async (values) => {
    try {
      setError(null);
      await requestOpsLoginOtp(values);
      setStep("otp");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    const email = form.getValues("email");
    const parsed = z.object({ email: emailSchema, otp: otpSchema }).safeParse({ email, otp });
    if (!parsed.success) {
      setError("Enter a valid 6-digit OTP.");
      return;
    }
    try {
      setError(null);
      await verifyOpsLoginOtp(parsed.data);
      router.replace("/ops");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <OpsPublicLayout
      title="Sign in to Ops"
      description="Use your operator email. We will send a one-time code — your session is stored as an httpOnly cookie on the API host."
    >
      {step === "email" ? (
        <OpsCard>
          <form onSubmit={handleRequestOtp} className="grid gap-5">
            <OpsField label="Work email" htmlFor="ops-login-email">
              <OpsInput
                id="ops-login-email"
                type="email"
                autoComplete="email"
                placeholder="ops@yourcompany.com"
                {...form.register("email")}
              />
            </OpsField>
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending code…" : "Send verification code"}
            </Button>
          </form>
        </OpsCard>
      ) : (
        <OpsCard>
          <form onSubmit={handleVerify} className="grid gap-5">
            <OpsAlert tone="info">
              Code sent to <strong>{form.getValues("email")}</strong>. Check your inbox.
            </OpsAlert>
            <OpsField label="6-digit code" htmlFor="ops-login-otp">
              <OpsInput
                id="ops-login-otp"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                className="tracking-[0.3em]"
              />
            </OpsField>
            <Button type="submit" className="h-11 w-full">
              Verify and enter console
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
              Use a different email
            </Button>
          </form>
        </OpsCard>
      )}
      {error ? <OpsAlert tone="error" className="mt-4">{error}</OpsAlert> : null}
    </OpsPublicLayout>
  );
}
