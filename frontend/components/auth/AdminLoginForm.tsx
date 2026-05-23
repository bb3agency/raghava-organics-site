"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  requestAdminLoginOtp,
  verifyAdminLoginOtp,
} from "@/lib/admin-auth-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { emailSchema, otpSchema, passwordSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const verifySchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

type CredentialsValues = z.infer<typeof credentialsSchema>;

interface AdminLoginFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
  enrollmentHint?: boolean;
}

export function AdminLoginForm({ onSuccess, enrollmentHint }: AdminLoginFormProps) {
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const credentialsForm = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  const [otp, setOtp] = useState("");

  const handleRequestOtp = credentialsForm.handleSubmit(async (values) => {
    try {
      setError(null);
      const response = await requestAdminLoginOtp(values);
      setExpiresAt(response.expiresAt);
      setStep("otp");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    const email = credentialsForm.getValues("email");
    const parsed = verifySchema.safeParse({ email, otp });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid OTP.");
      return;
    }

    try {
      setError(null);
      const session = await verifyAdminLoginOtp(parsed.data);
      await onSuccess(session);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="grid gap-4">
      {enrollmentHint ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          After invite setup, sign in with your admin email. A one-time code will be sent to your
          email.
        </p>
      ) : null}

      {step === "credentials" ? (
        <form onSubmit={handleRequestOtp} className="grid gap-4">
          <div className="grid gap-1">
            <label htmlFor="admin-email" className="text-sm font-medium">
              Admin email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
              {...credentialsForm.register("email")}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="admin-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
              {...credentialsForm.register("password")}
            />
          </div>
          <button
            type="submit"
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={credentialsForm.formState.isSubmitting}
          >
            {credentialsForm.formState.isSubmitting ? "Sending code..." : "Send login code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to {credentialsForm.getValues("email")}
            {expiresAt ? ` (expires ${new Date(expiresAt).toLocaleTimeString()})` : ""}.
          </p>
          <label className="grid gap-1 text-sm" htmlFor="admin-otp">
            Login code
            <input
              id="admin-otp"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            />
          </label>
          <button
            type="button"
            className="text-left text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setStep("credentials")}
          >
            Use different email
          </button>
          <button
            type="submit"
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Verify and sign in
          </button>
        </form>
      )}

      <AuthErrorBanner message={error} />
    </div>
  );
}
