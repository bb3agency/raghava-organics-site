"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminSessionRestore } from "@/hooks/use-admin-session-restore";
import { canAccessAdmin } from "@/lib/permissions";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { status, user } = useAdminSessionRestore();

  useEffect(() => {
    if (status === "failed") {
      router.replace("/admin/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "ready" && user && !canAccessAdmin(user)) {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

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

  if (!user || !canAccessAdmin(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Checking permissions…" />
      </div>
    );
  }

  return <>{children}</>;
}
