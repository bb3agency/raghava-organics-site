"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getApiErrorMessage } from "@/lib/error-messages";
import { sendOtp, verifyOtpAndSignup, getOtpChannelConfig, type OtpChannelConfigResponse } from "@/lib/auth-api";
import { signupPhoneInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { TurnstileChallenge } from "@/components/auth/TurnstileChallenge";
import { useAuthTurnstile } from "@/hooks/use-auth-turnstile";
import type { AuthSession } from "@/types/user";

type FormValues = z.infer<typeof signupPhoneInputSchema>;

interface SignupPhoneFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function SignupPhoneForm({ onSuccess }: SignupPhoneFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [config, setConfig] = useState<OtpChannelConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const {
    required: turnstileRequired,
    ready: turnstileReady,
    turnstileField,
    onTurnstileTokenChange,
    turnstileLoadError,
    setTurnstileLoadError,
  } = useAuthTurnstile();

  useEffect(() => {
    async function loadConfig() {
      try {
        const data = await getOtpChannelConfig();
        setConfig(data);
      } catch (err) {
        setError(getApiErrorMessage(err) || "Failed to load signup config");
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, []);

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
    if (turnstileRequired && !turnstileReady) {
      setError("Complete the security check below before requesting an OTP.");
      return;
    }

    const effectiveChannel = config?.channel || "sms";
    const fieldsToValidate: (keyof FormValues)[] = ["phone"];
    if (effectiveChannel === "email") fieldsToValidate.push("email");

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) return;

    const phone = form.getValues("phone");
    const email = form.getValues("email");

    try {
      setError(null);
      setOtpInfo("Sending OTP...");
      const result = await sendOtp({
        phone,
        channel: effectiveChannel,
        ...(effectiveChannel === "email" && email ? { email } : {}),
        ...turnstileField,
      });
      setOtpInfo(result.message);
    } catch (err) {
      setOtpInfo(null);
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

  const effectiveChannel = config?.channel || "sms";

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-1.5">
        <label className="text-sm font-bold text-[#23403d]">
          {effectiveChannel === "whatsapp"
            ? "Enter your details to receive OTP via WhatsApp"
            : effectiveChannel === "email"
              ? "Enter your details to receive OTP via Email"
              : "Enter your details to receive OTP via SMS"}
        </label>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="phone" className="text-sm font-bold text-[#23403d]">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("phone")}
        />
        <p className="text-xs font-bold text-red-500">{form.formState.errors.phone?.message}</p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="otp" className="text-sm font-bold text-[#23403d]">
          OTP
        </label>
        <input
          id="otp"
          type="text"
          inputMode="numeric"
          maxLength={6}
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-center text-lg font-bold tracking-[0.5em] text-[#23403d] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("otp")}
        />
        <p className="text-xs font-bold text-red-500">{form.formState.errors.otp?.message}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input
          type="text"
          placeholder="First name"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("firstName")}
        />
        <input
          type="text"
          placeholder="Last name"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("lastName")}
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-bold text-[#23403d]">
          Email{" "}
          <span className="font-medium text-[#767676]">
            {effectiveChannel === "email" ? "(required for OTP)" : "(optional)"}
          </span>
        </label>
        <input
          id="email"
          type="email"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("email")}
          required={effectiveChannel === "email"}
        />
        <p className="text-xs font-bold text-red-500">{form.formState.errors.email?.message}</p>
      </div>

      <TurnstileChallenge
        onTokenChange={onTurnstileTokenChange}
        onLoadError={setTurnstileLoadError}
      />
      {turnstileLoadError ? (
        <p className="text-xs font-bold text-red-500" role="alert">
          {turnstileLoadError}
        </p>
      ) : null}

      <button
        type="button"
        className="h-12 w-full rounded-full border-2 border-[#efe8e4] bg-white px-6 text-sm font-bold text-[#23403d] transition-colors hover:border-[#23403d] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => void send()}
        disabled={
          form.formState.isSubmitting || loadingConfig || (turnstileRequired && !turnstileReady)
        }
      >
        {loadingConfig ? "Loading..." : "Send OTP"}
      </button>

      {otpInfo ? <p className="text-xs font-bold text-[#00aa63]">{otpInfo}</p> : null}
      <AuthErrorBanner message={error} />
      <button
        type="submit"
        className="mt-2 h-12 w-full rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
