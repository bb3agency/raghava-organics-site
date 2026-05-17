"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import type { AuthSession } from "@/types/user";
import { useAuthStore } from "@/stores/auth";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const enrollmentHint = searchParams.get("mfaEnrollment") === "1";

  const handleSuccess = async (session: AuthSession) => {
    setSession(session.accessToken, session.user);
    router.replace("/admin");
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border p-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Merchant admin access only. Use your admin email and password.
        </p>
      </div>

      <AdminLoginForm onSuccess={handleSuccess} enrollmentHint={enrollmentHint} />

      <div className="grid gap-2 text-center text-sm">
        <Link
          href="/login"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Customer sign in
        </Link>
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Back to store
        </Link>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading admin sign in...</p>}
    >
      <AdminLoginContent />
    </Suspense>
  );
}
