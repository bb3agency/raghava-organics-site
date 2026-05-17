"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { consumeAdminInvite, sendAdminSetupOtp } from "@/lib/admin-setup-api";

interface AdminSetupFormProps {
  token: string;
}

export function AdminSetupForm({ token }: AdminSetupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function requestOtp() {
    setError(null);
    setIsLoading(true);
    try {
      const response = await sendAdminSetupOtp({
        token,
        phone,
        password,
        ...(name.trim() ? { name } : {}),
      });
      setOtpSent(true);
      setExpiresAt(response.expiresAt);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError("Unable to send OTP.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function consumeInvite() {
    setError(null);
    setIsLoading(true);
    try {
      const result = await consumeAdminInvite({ token, otp });
      const target = result.mfaRequired
        ? "/admin/login?mfaEnrollment=1"
        : "/admin/login";
      router.replace(target);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError("Unable to complete admin setup.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-xl gap-4 rounded-lg border border-border p-6">
      <h1 className="font-heading text-2xl font-semibold">Admin setup</h1>
      <p className="text-sm text-muted-foreground">
        Complete invite onboarding using OTP verification.
      </p>
      <label className="grid gap-1 text-sm">
        Name (optional)
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
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
      <label className="grid gap-1 text-sm">
        Password
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          minLength={8}
          required
        />
      </label>
      <button
        type="button"
        onClick={requestOtp}
        disabled={isLoading || !phone.trim() || password.trim().length < 8}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        Send OTP
      </button>
      {otpSent ? (
        <>
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
            onClick={consumeInvite}
            disabled={isLoading || otp.trim().length !== 6}
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
