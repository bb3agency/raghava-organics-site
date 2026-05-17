"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import {
  confirmAdminMfaSetup,
  disableAdminMfa,
  startAdminMfaSetup,
} from "@/lib/admin-auth-api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { useAuthStore } from "@/stores/auth";

type SetupState = "idle" | "pending" | "enabled";

export function AdminMfaSetupPanel() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleStartSetup() {
    if (!accessToken) {
      return;
    }
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const response = await startAdminMfaSetup(accessToken);
      setSecret(response.secret);
      setOtpauthUrl(response.otpauthUrl);
      setSetupState("pending");
      setMessage(response.message);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmSetup() {
    if (!accessToken) {
      return;
    }
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const response = await confirmAdminMfaSetup(accessToken, confirmCode);
      setSetupState("enabled");
      setSecret(null);
      setOtpauthUrl(null);
      setConfirmCode("");
      setMessage(response.message);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisableMfa() {
    if (!accessToken) {
      return;
    }
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const response = await disableAdminMfa(accessToken, disableCode);
      setSetupState("idle");
      setDisableCode("");
      setMessage(response.message);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function copySecret() {
    if (!secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      setMessage("Secret copied to clipboard.");
    } catch {
      setError("Unable to copy secret. Enter it manually in your authenticator app.");
    }
  }

  return (
    <section className="grid gap-6 rounded-lg border border-border p-6">
      <div>
        <h2 className="font-heading text-xl font-semibold">Admin MFA</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          When <code className="text-xs">ADMIN_MFA_ENFORCE=true</code> on the API, admins must
          enroll before sign-in. Scan the secret in Google Authenticator, 1Password, or Authy,
          then confirm with a live code.
        </p>
      </div>

      {setupState === "idle" ? (
        <button
          type="button"
          onClick={handleStartSetup}
          disabled={isLoading || !accessToken}
          className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Starting..." : "Start MFA enrollment"}
        </button>
      ) : null}

      {setupState === "pending" && secret ? (
        <div className="grid gap-4 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Step 1 — Add to authenticator</p>
          {otpauthUrl ? (
            <a
              href={otpauthUrl}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Open otpauth link (mobile friendly)
            </a>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-xs">{secret}</code>
            <button
              type="button"
              onClick={copySecret}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium"
              aria-label="Copy MFA secret"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy secret
            </button>
          </div>
          <label className="grid gap-1 text-sm">
            Step 2 — Confirm with authenticator code
            <input
              value={confirmCode}
              onChange={(event) => setConfirmCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            />
          </label>
          <button
            type="button"
            onClick={handleConfirmSetup}
            disabled={isLoading || confirmCode.trim().length < 6}
            className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {isLoading ? "Confirming..." : "Confirm MFA"}
          </button>
        </div>
      ) : null}

      {setupState === "enabled" ? (
        <div className="grid gap-4 rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">
            MFA is enabled for this admin account. You will be prompted for a code on each admin
            sign-in.
          </p>
          <label className="grid gap-1 text-sm">
            Disable MFA (requires current code)
            <input
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            />
          </label>
          <button
            type="button"
            onClick={handleDisableMfa}
            disabled={isLoading || disableCode.trim().length < 6}
            className="h-10 w-fit rounded-md border border-destructive px-4 text-sm font-medium text-destructive disabled:opacity-60"
          >
            {isLoading ? "Disabling..." : "Disable MFA"}
          </button>
        </div>
      ) : null}

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
    </section>
  );
}
