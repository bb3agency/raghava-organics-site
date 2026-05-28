"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignupPhoneForm } from "@/components/auth/SignupPhoneForm";
import { EmailRegisterForm } from "@/components/auth/EmailRegisterForm";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { mergeCart } from "@/lib/cart-api";
import type { AuthSession } from "@/types/user";

type RegisterMode = "otp" | "email";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const pendingMerge = useCartStore((s) => s.pendingMerge);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);
  const [mode, setMode] = useState<RegisterMode>("otp");

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
      <div className="text-center">
        <h1 className="font-heading text-3xl font-bold text-[#23403d]">Create Account</h1>
        <p className="mt-3 text-sm font-medium text-[#767676]">
          Sign up using OTP for instant access, or create an email/password account.
        </p>
      </div>

      <div className="grid gap-6">
        <div
          className="flex gap-2 rounded-full border border-[#efe8e4] bg-[#faf3ef] p-1.5"
          role="tablist"
          aria-label="Register method"
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
            OTP Signup
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
            Email Signup
          </button>
        </div>

        {mode === "otp" ? (
          <SignupPhoneForm onSuccess={handleSuccess} />
        ) : (
          <EmailRegisterForm onSuccess={handleSuccess} />
        )}
      </div>

      <div className="border-t border-[#efe8e4] pt-6">
        <Link
          href="/login"
          className="block text-center text-sm font-bold text-[#23403d] transition-colors hover:text-[#ec6e55]"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
