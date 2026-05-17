"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { consumeOpsInvite, sendOpsSetupOtp } from "@/lib/ops-setup-api";

interface OpsSetupFormProps {
  token: string;
}

interface InviteResult {
  opsUserId: string;
  email: string;
  name: string;
  keyId: string;
  apiKey: string;
  permissions: string[];
  ipAllowlist: string[];
}

export function OpsSetupForm({ token }: OpsSetupFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSendOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await sendOpsSetupOtp({ token, name, phone });
      setOtpSent(true);
      setExpiresAt(response.expiresAt);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError("Unable to send OTP.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onCompleteSetup() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await consumeOpsInvite({ token, otp });
      setResult(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError("Unable to complete setup.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <h2 className="font-heading text-lg font-semibold">Ops setup complete</h2>
        <p>Store these credentials in a secure vault and remove them from browser history.</p>
        <p>Ops user: {result.name} ({result.email})</p>
        <p>Key ID: {result.keyId}</p>
        <p>API key: {result.apiKey}</p>
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
        Phone
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          required
        />
      </label>
      <button
        type="button"
        onClick={onSendOtp}
        disabled={isSubmitting || !name.trim() || !phone.trim()}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        Send OTP
      </button>
      {otpSent ? (
        <>
          <label className="grid gap-1 text-sm">
            OTP
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
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Complete setup
          </button>
        </>
      ) : null}
      {expiresAt ? <p className="text-xs text-muted-foreground">OTP expires at: {expiresAt}</p> : null}
      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
