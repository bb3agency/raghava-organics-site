"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { canAccessAdmin } from "@/lib/permissions";

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace("/admin/login");
      return;
    }
    if (!canAccessAdmin(user)) {
      router.replace("/dashboard");
    }
  }, [accessToken, router, user]);

  if (!accessToken) {
    return <p className="text-sm text-muted-foreground">Checking admin session...</p>;
  }

  if (!canAccessAdmin(user)) {
    return <p className="text-sm text-muted-foreground">Checking permissions...</p>;
  }

  return <>{children}</>;
}
