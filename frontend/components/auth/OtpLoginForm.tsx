"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { sendOtp, verifyOtp } from "@/lib/auth-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { sendOtpInputSchema, verifyOtpInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

const phoneSchema = sendOtpInputSchema.pick({ phone: true });
type PhoneValues = z.infer<typeof phoneSchema>;
type VerifyValues = z.infer<typeof verifyOtpInputSchema>;

interface OtpLoginFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function OtpLoginForm({ onSuccess }: OtpLoginFormProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifyOtpInputSchema),
    defaultValues: { phone: "", otp: "" },
  });

  const send = phoneForm.handleSubmit(async (values) => {
    try {
      setError(null);
      const result = await sendOtp(values);
      setInfo(result.message);
      setPhone(values.phone);
      verifyForm.setValue("phone", values.phone);
      setStep("otp");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  const verify = verifyForm.handleSubmit(async (values) => {
    try {
      setError(null);
      const session = await verifyOtp(values);
      await onSuccess(session);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  return step === "phone" ? (
    <form onSubmit={send} className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="9876543210"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...phoneForm.register("phone")}
        />
        <p className="text-xs text-destructive">
          {phoneForm.formState.errors.phone?.message}
        </p>
      </div>
      <AuthErrorBanner message={error} />
      <button
        type="submit"
        className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={phoneForm.formState.isSubmitting}
      >
        {phoneForm.formState.isSubmitting ? "Sending OTP..." : "Send OTP"}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        OTP sent to <span className="font-medium text-foreground">{phone}</span>.
      </p>
      {info ? <p className="text-xs text-muted-foreground">{info}</p> : null}
      <input type="hidden" {...verifyForm.register("phone")} />
      <div className="grid gap-1">
        <label htmlFor="otp" className="text-sm font-medium">
          OTP
        </label>
        <input
          id="otp"
          type="text"
          inputMode="numeric"
          maxLength={6}
          className="h-11 rounded-md border border-border bg-background px-3 text-sm tracking-[0.25em]"
          {...verifyForm.register("otp")}
        />
        <p className="text-xs text-destructive">
          {verifyForm.formState.errors.otp?.message}
        </p>
      </div>
      <AuthErrorBanner message={error} />
      <div className="flex gap-2">
        <button
          type="button"
          className="h-11 rounded-md border border-border px-4 text-sm font-medium"
          onClick={() => setStep("phone")}
        >
          Change number
        </button>
        <button
          type="submit"
          className="h-11 flex-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={verifyForm.formState.isSubmitting}
        >
          {verifyForm.formState.isSubmitting ? "Verifying..." : "Verify OTP"}
        </button>
      </div>
    </form>
  );
}
