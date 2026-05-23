"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  requestOpsOtpChallenge,
  type OpsOtpActionType,
} from "@/lib/ops-client-api";

interface OpsCriticalOtpFormProps {
  actionType: OpsOtpActionType;
  buttonLabel: string;
  onExecute: (payload: { challengeId: string; otpCode: string }) => Promise<void>;
  children?: React.ReactNode;
}

export function OpsCriticalOtpForm({
  actionType,
  buttonLabel,
  onExecute,
  children,
}: OpsCriticalOtpFormProps) {
  const [challengeId, setChallengeId] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function handleRequestOtp() {
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const challenge = await requestOpsOtpChallenge(actionType);
      setChallengeId(challenge.challengeId);
      setExpiresAt(challenge.expiresAt);
      setMessage("OTP sent to your ops email. Enter it below to continue.");
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId || otpCode.trim().length !== 6) {
      setError("Request an OTP and enter the 6-digit code.");
      return;
    }
    if (secondsLeft <= 0) {
      setError("OTP expired. Request a new code.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      await onExecute({ challengeId, otpCode: otpCode.trim() });
      setMessage("Action completed successfully.");
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "ops_audit_chain_lock_timeout") {
        setError(getApiErrorMessageWithHint(err));
        window.setTimeout(() => {
          void handleSubmit(event);
        }, 1500);
        return;
      }
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-border p-4">
      {children}
      <button
        type="button"
        onClick={handleRequestOtp}
        disabled={isLoading}
        className="h-10 w-fit rounded-md border border-border px-4 text-sm font-medium"
      >
        {isLoading ? "Sending OTP..." : "Send OTP to email"}
      </button>
      {challengeId ? (
        <p className="text-xs text-muted-foreground">
          Challenge: <code>{challengeId}</code>
          {secondsLeft > 0 ? ` · expires in ${secondsLeft}s` : " · expired"}
        </p>
      ) : null}
      <label className="grid gap-1 text-sm">
        OTP code
        <input
          value={otpCode}
          onChange={(event) => setOtpCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
        />
      </label>
      <button
        type="submit"
        disabled={isLoading || secondsLeft <= 0}
        className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Working..." : buttonLabel}
      </button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
