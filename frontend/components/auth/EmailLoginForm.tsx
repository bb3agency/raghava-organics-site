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
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("email")}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.email?.message}
        </p>
      </div>

      <div className="grid gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("password")}
        />
        <p className="text-xs text-destructive">
          {form.formState.errors.password?.message}
        </p>
      </div>

      <AuthErrorBanner message={error} />

      <button
        type="submit"
        className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Signing in..." : "Sign in with email"}
      </button>
    </form>
  );
}
