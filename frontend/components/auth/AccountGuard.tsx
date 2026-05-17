"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";

interface AccountGuardProps {
  children: ReactNode;
}

export function AccountGuard({ children }: AccountGuardProps) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace("/login");
    }
  }, [accessToken, router]);

  if (!accessToken) {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Redirecting to sign in...
      </p>
    );
  }

  return <>{children}</>;
}
