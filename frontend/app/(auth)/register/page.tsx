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
    <div className="flex flex-col gap-6 rounded-lg border border-border p-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verify OTP to create your customer account.
        </p>
      </div>
      <SignupPhoneForm onSuccess={handleSuccess} />
      <Link
        href="/login"
        className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Already have an account? Sign in
      </Link>
    </div>
  );
}
