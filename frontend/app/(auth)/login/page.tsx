"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import type { AuthSession } from "@/types/user";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { mergeCart } from "@/lib/cart-api";
import { OtpLoginForm } from "@/components/auth/OtpLoginForm";
import { EmailLoginForm } from "@/components/auth/EmailLoginForm";

type LoginMode = "otp" | "email";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const pendingMerge = useCartStore((s) => s.pendingMerge);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);
  const [mode, setMode] = useState<LoginMode>("otp");
  const justReset = searchParams.get("reset") === "success";

  const handleSuccess = async (session: AuthSession) => {
    setSession(session.accessToken, session.user);
    if (pendingMerge) {
      await mergeCart(session.accessToken);
      clearPendingMerge();
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col gap-8 p-8 lg:p-12">
      {justReset ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          Password reset successful. Please sign in with your new password.
        </p>
      ) : null}
      <div className="text-center">
        <h1 className="font-heading text-3xl font-bold text-[#23403d]">Welcome Back</h1>
        <p className="mt-3 text-sm font-medium text-[#767676]">
          Sign in to your {APP_NAME} account using OTP or email.
        </p>
      </div>

      <div className="grid gap-6">
        <div
          className="flex gap-2 rounded-full border border-[#efe8e4] bg-[#faf3ef] p-1.5"
          role="tablist"
          aria-label="Login method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "otp"}
            className={`flex-1 h-10 rounded-full text-sm font-bold transition-colors ${
              mode === "otp" ? "bg-[#23403d] text-white shadow-sm" : "text-[#767676] hover:text-[#23403d]"
            }`}
            onClick={() => setMode("otp")}
          >
            OTP Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "email"}
            className={`flex-1 h-10 rounded-full text-sm font-bold transition-colors ${
              mode === "email"
                ? "bg-[#23403d] text-white shadow-sm"
                : "text-[#767676] hover:text-[#23403d]"
            }`}
            onClick={() => setMode("email")}
          >
            Email Login
          </button>
        </div>

        {mode === "otp" ? (
          <OtpLoginForm onSuccess={handleSuccess} />
        ) : (
          <EmailLoginForm onSuccess={handleSuccess} />
        )}
      </div>

      <div className="grid gap-4 text-center">
        <Link
          href="/register"
          className="text-sm font-bold text-[#ec6e55] transition-colors hover:text-[#23403d]"
        >
          New customer? Create an account
        </Link>
        <Link
          href="/forgot-password"
          className="text-sm font-bold text-[#767676] transition-colors hover:text-[#23403d]"
        >
          Forgot password?
        </Link>
      </div>

      <div className="border-t border-[#efe8e4] pt-6">
        <Link
          href="/"
          className="block text-center text-sm font-bold text-[#23403d] transition-colors hover:text-[#ec6e55]"
        >
          &larr; Back to store
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-8 p-8 lg:p-12">
          <p className="text-center text-sm text-muted-foreground">Loading sign in…</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
