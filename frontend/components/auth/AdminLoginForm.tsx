"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { loginAdmin } from "@/lib/admin-auth-api";
import { getAdminLoginErrorMessage } from "@/lib/error-messages";
import { adminLoginInputSchema } from "@/lib/validators";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import type { AuthSession } from "@/types/user";

const formSchema = adminLoginInputSchema;
type FormValues = z.infer<typeof formSchema>;

interface AdminLoginFormProps {
  onSuccess: (session: AuthSession) => Promise<void> | void;
  enrollmentHint?: boolean;
}

export function AdminLoginForm({ onSuccess, enrollmentHint }: AdminLoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      mfaCode: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      const session = await loginAdmin({
        email: values.email,
        password: values.password,
        ...(values.mfaCode?.trim() ? { mfaCode: values.mfaCode.trim() } : {}),
      });
      await onSuccess(session);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        err.message.toLowerCase().includes("mfa code is required")
      ) {
        setMfaRequired(true);
      }
      setError(getAdminLoginErrorMessage(err));
    }
  });

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {enrollmentHint ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          After invite setup, sign in here. If MFA enforcement is enabled but you have not
          enrolled yet, complete enrollment at{" "}
          <span className="font-medium text-foreground">Admin → Security → MFA</span> while
          enforcement is off, or ask your operator for a bootstrap window.
        </p>
      ) : null}

      <div className="grid gap-1">
        <label htmlFor="admin-email" className="text-sm font-medium">
          Admin email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("email")}
        />
        <p className="text-xs text-destructive">{form.formState.errors.email?.message}</p>
      </div>

      <div className="grid gap-1">
        <label htmlFor="admin-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("password")}
        />
        <p className="text-xs text-destructive">{form.formState.errors.password?.message}</p>
      </div>

      {mfaRequired ? (
        <div className="grid gap-1">
          <label htmlFor="admin-mfa-code" className="text-sm font-medium">
            Authenticator code
          </label>
          <input
            id="admin-mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            className="h-11 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            {...form.register("mfaCode")}
          />
          <p className="text-xs text-destructive">{form.formState.errors.mfaCode?.message}</p>
        </div>
      ) : null}

      <AuthErrorBanner message={error} />

      <button
        type="submit"
        className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Signing in..." : "Sign in to admin"}
      </button>
    </form>
  );
}
