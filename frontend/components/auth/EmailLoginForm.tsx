"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { loginWithEmail } from "@/lib/auth-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { emailLoginInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

const formSchema = emailLoginInputSchema;
type FormValues = z.infer<typeof formSchema>;

interface EmailLoginFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
}

export function EmailLoginForm({ onSuccess }: EmailLoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      const session = await loginWithEmail(values);
      await onSuccess(session);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-bold text-[#23403d]">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("email")}
        />
        <p className="text-xs font-bold text-red-500">
          {form.formState.errors.email?.message}
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-bold text-[#23403d]">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-12 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] px-4 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
          {...form.register("password")}
        />
        <p className="text-xs font-bold text-red-500">
          {form.formState.errors.password?.message}
        </p>
      </div>

      <AuthErrorBanner message={error} />

      <button
        type="submit"
        className="mt-2 h-12 w-full rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Signing in..." : "Sign in with email"}
      </button>
    </form>
  );
}
