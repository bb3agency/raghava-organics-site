"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignupPhoneForm } from "@/components/auth/SignupPhoneForm";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { mergeCart } from "@/lib/cart-api";
import type { AuthSession } from "@/types/user";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const pendingMerge = useCartStore((s) => s.pendingMerge);
  const clearPendingMerge = useCartStore((s) => s.clearPendingMerge);

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
          Send OTP via SMS, WhatsApp, or Email to instantly create your account.
        </p>
      </div>

      <SignupPhoneForm onSuccess={handleSuccess} />

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
