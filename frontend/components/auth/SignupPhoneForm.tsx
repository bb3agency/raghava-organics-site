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
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor="signup-otp-channel" className="text-sm font-bold text-[#23403d]">
          Receive OTP via
        </label>
        <select
          id="signup-otp-channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as OtpChannel)}
          className="h-12 w-full cursor-pointer rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
        >
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
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
        <p className="text-xs font-bold text-red-500">
          {form.formState.errors.phone?.message}
        </p>
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
        <p className="text-xs font-bold text-red-500">
          {form.formState.errors.otp?.message}
        </p>
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
          Email <span className="text-[#767676] font-medium">{channel === "email" ? "(required for OTP)" : "(optional)"}</span>
        </label>
        <input
          id="email"
          type="email"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("email")}
          required={channel === "email"}
        />
        <p className="text-xs font-bold text-red-500">
          {form.formState.errors.email?.message}
        </p>
      </div>

      <button
        type="button"
        className="h-12 w-full rounded-full border-2 border-[#efe8e4] bg-white px-6 text-sm font-bold text-[#23403d] transition-colors hover:border-[#23403d] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => void send()}
        disabled={form.formState.isSubmitting}
      >
        Send OTP
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
