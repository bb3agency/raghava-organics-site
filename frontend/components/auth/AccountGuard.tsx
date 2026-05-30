"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccountSessionRestore } from "@/hooks/use-account-session-restore";

interface AccountGuardProps {
  children: ReactNode;
}

export function AccountGuard({ children }: AccountGuardProps) {
  const router = useRouter();
  const { status, accessToken } = useAccountSessionRestore();

  useEffect(() => {
    if (status === "failed") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "checking" || status === "restoring") {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Restoring your session…
      </p>
    );
  }

  if (status === "failed" || !accessToken) {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Redirecting to sign in…
      </p>
    );
  }

  return <>{children}</>;
}
