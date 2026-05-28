"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { canAccessAdmin } from "@/lib/permissions";
import { refreshAccessToken } from "@/lib/auth-api";
import { parseAccessTokenClaims } from "@/lib/jwt-utils";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";
import type { User } from "@/types/user";

interface AdminGuardProps {
  children: ReactNode;
}

type RestoreState = "idle" | "restoring" | "restored" | "failed";

function buildMinimalUserFromClaims(accessToken: string): User | null {
  const claims = parseAccessTokenClaims(accessToken);
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: null,
    phone: null,
    firstName: null,
    lastName: null,
    isVerified: true,
    role: claims.role ?? undefined,
    permissions: claims.permissions ?? [],
  };
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [restoreState, setRestoreState] = useState<RestoreState>(
    accessToken ? "restored" : "idle"
  );

  useEffect(() => {
    // If we already have an access token, nothing to restore
    if (accessToken) {
      setRestoreState("restored");
      return;
    }

    // Otherwise try to restore from the HTTP-only refresh cookie
    let cancelled = false;
    setRestoreState("restoring");

    async function restore() {
      try {
        const refreshed = await refreshAccessToken();
        if (cancelled) return;

        const restoredUser = buildMinimalUserFromClaims(refreshed.accessToken);
        if (restoredUser && restoredUser.role === "ADMIN") {
          setSession(refreshed.accessToken, restoredUser);
          setRestoreState("restored");
        } else {
          // Token is valid but not an admin — clear and redirect
          clearSession();
          setRestoreState("failed");
          router.replace("/dashboard");
        }
      } catch {
        if (cancelled) return;
        clearSession();
        setRestoreState("failed");
        router.replace("/admin/login");
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [accessToken, router, setSession, clearSession]);

  // After restore completes, validate admin permission
  useEffect(() => {
    if (restoreState === "restored" && !canAccessAdmin(user)) {
      router.replace("/dashboard");
    }
  }, [restoreState, user, router]);

  if (restoreState === "restoring") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Restoring admin session…" />
      </div>
    );
  }

  if (restoreState === "failed" || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Redirecting to sign in…" />
      </div>
    );
  }

  if (!canAccessAdmin(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Checking permissions…" />
      </div>
    );
  }

  return <>{children}</>;
}
