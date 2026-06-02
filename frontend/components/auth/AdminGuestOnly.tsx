"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useAdminSessionRestore } from "@/hooks/use-admin-session-restore";
import { resolveAdminUser } from "@/lib/resolve-admin-user";
import { useAuthStore } from "@/stores/auth";

interface AdminGuestOnlyProps {
  children: ReactNode;
  /** Where to send users who already have a valid admin session. */
  redirectTo?: string;
}

/**
 * Renders sign-in UI only for unauthenticated guests.
 * Redirects away when an admin session exists (memory or refresh cookie).
 */
export function AdminGuestOnly({
  children,
  redirectTo = "/admin",
}: AdminGuestOnlyProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status, user } = useAdminSessionRestore();

  const adminUser = useMemo(
    () => resolveAdminUser(accessToken, user),
    [accessToken, user],
  );

  const hasAdminSession = status === "ready" && adminUser !== null;

  useEffect(() => {
    if (hasAdminSession) {
      window.location.assign(redirectTo);
    }
  }, [hasAdminSession, redirectTo]);

  if (hasAdminSession) {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Redirecting to admin console…
      </p>
    );
  }

  if (status === "checking" || status === "restoring") {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Checking admin session…
      </p>
    );
  }

  return <>{children}</>;
}
