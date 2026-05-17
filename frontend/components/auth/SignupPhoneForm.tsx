"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getApiErrorMessage } from "@/lib/error-messages";
import { verifyOtpAndSignup } from "@/lib/auth-api";
import { signupPhoneInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

type FormValues = z.infer<typeof signupPhoneInputSchema>;

interface SignupPhoneFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function SignupPhoneForm({ onSuccess }: SignupPhoneFormProps) {
  const [error, setError] = useState<string | null>(null);
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
          Email (optional)
        </label>
        <input
          id="email"
          type="email"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("email")}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.email?.message}
        </p>
      </div>

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
