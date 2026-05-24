"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import type { AuthSession } from "@/types/user";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { mergeCart } from "@/lib/cart-api";
import { OtpLoginForm } from "@/components/auth/OtpLoginForm";
import { EmailLoginForm } from "@/components/auth/EmailLoginForm";

type LoginMode = "otp" | "email";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const pendingMerge = useCartStore((s) => s.pendingMerge);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);
  const [mode, setMode] = useState<LoginMode>("otp");

  const modeLabel = useMemo(() => {
    return mode === "otp" ? "Phone OTP login (SMS, WhatsApp, or Email)" : "Email password login";
  }, [mode]);

  const handleSuccess = async (session: AuthSession) => {
    setSession(session.accessToken, session.user);
    if (pendingMerge) {
      await mergeCart(session.accessToken);
      clearPendingMerge();
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border p-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Continue to {APP_NAME} using OTP (SMS/WhatsApp/Email) or email + password.
        </p>
      </div>

      <div className="grid gap-3">
        <div
          className="grid grid-cols-2 gap-2 rounded-md border border-border p-1"
          role="tablist"
          aria-label="Login method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "otp"}
            className={`h-10 rounded-sm text-sm font-medium ${
              mode === "otp" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setMode("otp")}
          >
            OTP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "email"}
            className={`h-10 rounded-sm text-sm font-medium ${
              mode === "email"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
            onClick={() => setMode("email")}
          >
            Email
          </button>
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {modeLabel}
        </p>

        {mode === "otp" ? (
          <OtpLoginForm onSuccess={handleSuccess} />
        ) : (
          <EmailLoginForm onSuccess={handleSuccess} />
        )}
      </div>

      <div className="grid gap-2 text-center text-sm">
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          New customer? Create account
        </Link>
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Forgot password
        </Link>
      </div>

      <Link
        href="/"
        className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to store
      </Link>
    </div>
  );
}
