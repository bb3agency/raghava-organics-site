"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { consumeOpsInvite, sendOpsSetupOtp } from "@/lib/ops-setup-api";

interface OpsSetupFormProps {
  token: string;
}

export function OpsSetupForm({ token }: OpsSetupFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSendOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await sendOpsSetupOtp({
        token,
        name,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setOtpSent(true);
      setExpiresAt(response.expiresAt);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Unable to send OTP.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onCompleteSetup() {
    setError(null);
    setIsSubmitting(true);
    try {
      await consumeOpsInvite({ token, otp });
      setCompleted(true);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Unable to complete setup.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <h2 className="font-heading text-lg font-semibold">Ops setup complete</h2>
        <p>Sign in at the ops login page with your email and password to start a browser session.</p>
        <Link href="/ops/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Continue to ops login
        </Link>
      </div>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h2 className="font-heading text-lg font-semibold">Ops invite setup</h2>
      <p className="text-sm text-muted-foreground">
        Complete onboarding in two steps: send OTP, then consume invite token.
      </p>
      <label className="grid gap-1 text-sm">
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Phone (optional)
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={onSendOtp}
        disabled={isSubmitting || !name.trim()}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        Send OTP
      </button>
      {otpSent ? (
        <>
          {expiresAt ? (
            <p className="text-xs text-muted-foreground">
              OTP expires at {new Date(expiresAt).toLocaleString()}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm">
            OTP code
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              minLength={6}
              maxLength={6}
              required
            />
          </label>
          <button
            type="button"
            onClick={onCompleteSetup}
            disabled={isSubmitting || otp.trim().length !== 6}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Complete setup
          </button>
        </>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
