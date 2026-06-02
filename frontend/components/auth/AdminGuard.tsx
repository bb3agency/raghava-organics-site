"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useAdminSessionRestore } from "@/hooks/use-admin-session-restore";
import { redirectToAdminLogin } from "@/lib/admin-auth-navigation";
import { canAccessAdmin } from "@/lib/permissions";
import { resolveAdminUser } from "@/lib/resolve-admin-user";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";
import { useAuthStore } from "@/stores/auth";

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status, user } = useAdminSessionRestore();

  const adminUser = useMemo(
    () => resolveAdminUser(accessToken, user),
    [accessToken, user],
  );

  const sessionReady = status === "ready" && adminUser !== null;

  useEffect(() => {
    if (status === "failed") {
      redirectToAdminLogin();
    }
  }, [status]);

  useEffect(() => {
    if (status === "ready" && user && !canAccessAdmin(user)) {
      redirectToAdminLogin();
    }
  }, [status, user]);

  if (status === "checking" || status === "restoring") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Restoring admin session…" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Redirecting to sign in…" />
      </div>
    );
  }

  if (!sessionReady || !adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Checking permissions…" />
      </div>
    );
  }

  return <>{children}</>;
}
