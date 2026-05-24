"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getApiErrorMessage } from "@/lib/error-messages";
import { sendOtp, verifyOtpAndSignup } from "@/lib/auth-api";
import { signupPhoneInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

type FormValues = z.infer<typeof signupPhoneInputSchema>;
type OtpChannel = "sms" | "whatsapp" | "email";

interface SignupPhoneFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function SignupPhoneForm({ onSuccess }: SignupPhoneFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [channel, setChannel] = useState<OtpChannel>("sms");
  const form = useForm<FormValues>({
    resolver: zodResolver(signupPhoneInputSchema),
    defaultValues: {
      phone: "",
      otp: "",
      firstName: "",
      lastName: "",
      email: "",
    },
  });

  const send = async () => {
    const phone = form.getValues("phone");
    const email = form.getValues("email");
    if (!phone) {
      setError("Enter your phone number first.");
      return;
    }
    if (channel === "email" && !email) {
      setError("Email is required when OTP channel is Email.");
      return;
    }
    try {
      setError(null);
      const result = await sendOtp({
        phone,
        channel,
        ...(channel === "email" && email ? { email } : {}),
      });
      setOtpInfo(result.message);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      const session = await verifyOtpAndSignup({
        phone: values.phone,
        otp: values.otp,
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        email: values.email || undefined,
      });
      await onSuccess(session);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="signup-otp-channel" className="text-sm font-medium">
          Receive OTP via
        </label>
        <select
          id="signup-otp-channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as OtpChannel)}
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
      </div>

      <div className="grid gap-1">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("phone")}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.phone?.message}
        </p>
      </div>

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
          {...form.register("otp")}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.otp?.message}
        </p>
      </div>

      <div className="grid gap-1 md:grid-cols-2 md:gap-2">
        <input
          type="text"
          placeholder="First name"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("firstName")}
        />
        <input
          type="text"
          placeholder="Last name"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("lastName")}
        />
      </div>

      <div className="grid gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email {channel === "email" ? "(required for OTP)" : "(optional)"}
        </label>
        <input
          id="email"
          type="email"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("email")}
          required={channel === "email"}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.email?.message}
        </p>
      </div>

      <button
        type="button"
        className="h-11 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"
        onClick={() => void send()}
        disabled={form.formState.isSubmitting}
      >
        Send OTP
      </button>

      {otpInfo ? <p className="text-xs text-muted-foreground">{otpInfo}</p> : null}
      <AuthErrorBanner message={error} />
      <button
        type="submit"
        className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
