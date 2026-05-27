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
type OtpChannel = "sms" | "whatsapp" | "email";

interface OtpLoginFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function OtpLoginForm({ onSuccess }: OtpLoginFormProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<OtpChannel>("sms");
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
      const result = await sendOtp({
        phone: values.phone,
        channel,
        ...(channel === "email" && email.trim() ? { email: email.trim() } : {}),
      });
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
    <form onSubmit={send} className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor="otp-channel" className="text-sm font-bold text-[#23403d]">
          Receive OTP via
        </label>
        <select
          id="otp-channel"
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
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="9876543210"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...phoneForm.register("phone")}
        />
        <p className="text-xs font-bold text-red-500">
          {phoneForm.formState.errors.phone?.message}
        </p>
      </div>
      {channel === "email" ? (
        <div className="grid gap-1.5">
          <label htmlFor="otp-email" className="text-sm font-bold text-[#23403d]">
            Email for OTP
          </label>
          <input
            id="otp-email"
            type="email"
            autoComplete="email"
            className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
      ) : null}
      <AuthErrorBanner message={error} />
      <button
        type="submit"
        className="mt-2 h-12 w-full rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        disabled={phoneForm.formState.isSubmitting}
      >
        {phoneForm.formState.isSubmitting ? "Sending OTP..." : "Send OTP"}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="grid gap-5">
      <p className="text-sm font-medium text-[#767676]">
        OTP sent to <span className="font-bold text-[#23403d]">{phone}</span>.
      </p>
      {info ? <p className="text-xs font-bold text-[#00aa63]">{info}</p> : null}
      <input type="hidden" {...verifyForm.register("phone")} />
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
          {...verifyForm.register("otp")}
        />
        <p className="text-xs font-bold text-red-500">
          {verifyForm.formState.errors.otp?.message}
        </p>
      </div>
      <AuthErrorBanner message={error} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="h-12 w-full rounded-full border-2 border-[#efe8e4] bg-white px-6 text-sm font-bold text-[#23403d] transition-colors hover:border-[#23403d] sm:w-auto"
          onClick={() => setStep("phone")}
        >
          Change
        </button>
        <button
          type="submit"
          className="h-12 flex-1 rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={verifyForm.formState.isSubmitting}
        >
          {verifyForm.formState.isSubmitting ? "Verifying..." : "Verify OTP"}
        </button>
      </div>
    </form>
  );
}
