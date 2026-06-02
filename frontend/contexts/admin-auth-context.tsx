"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useAdminSessionRestore } from "@/hooks/use-admin-session-restore";
import { redirectToAdminLogin } from "@/lib/admin-auth-navigation";
import { resolveAdminUser } from "@/lib/resolve-admin-user";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";
import type { User } from "@/types/user";
import type { AuthSessionRestoreStatus } from "@/hooks/use-auth-session-restore";

interface AdminAuthContextValue {
  status: AuthSessionRestoreStatus;
  accessToken: string | null;
  user: User;
  adminUser: User;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { status, accessToken, user } = useAdminSessionRestore();
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
    if (status === "ready" && !adminUser) {
      const timer = window.setTimeout(() => redirectToAdminLogin(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [status, adminUser]);

  if (status === "checking" || status === "restoring") {
    return (
      <div className="admin-console flex min-h-screen items-center justify-center bg-background">
        <AdminLoadingBlock label="Restoring admin session…" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="admin-console flex min-h-screen items-center justify-center bg-background">
        <AdminLoadingBlock label="Redirecting to sign in…" />
      </div>
    );
  }

  if (!sessionReady || !adminUser) {
    return (
      <div className="admin-console flex min-h-screen items-center justify-center bg-background">
        <AdminLoadingBlock label="Checking admin session…" />
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        accessToken,
        user: adminUser,
        adminUser,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}
