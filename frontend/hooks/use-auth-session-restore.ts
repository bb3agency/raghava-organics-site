"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import {
  buildUserFromAccessToken,
  resetAuthSessionRestoreCache,
  restoreAuthSessionFromCookie,
} from "@/lib/restore-auth-session";
import { isAccessTokenUsable } from "@/lib/jwt-utils";
import type { User } from "@/types/user";

export type AuthSessionRestoreStatus =
  | "checking"
  | "restoring"
  | "ready"
  | "failed";

export type AuthSessionRestoreAudience = "admin" | "customer";

interface UseAuthSessionRestoreOptions {
  /** Return true when the restored user may access this surface. */
  validateUser: (user: User) => boolean;
  /** Isolates admin vs customer restore blocked/in-progress flags. */
  audience?: AuthSessionRestoreAudience;
}

interface UseAuthSessionRestoreResult {
  status: AuthSessionRestoreStatus;
  accessToken: string | null;
  user: User | null;
}

function hasValidSession(
  accessToken: string | null,
  user: User | null,
  validateUser: (user: User) => boolean,
): boolean {
  if (!accessToken || !isAccessTokenUsable(accessToken)) {
    return false;
  }
  if (user && validateUser(user)) {
    return true;
  }
  const fromToken = buildUserFromAccessToken(accessToken);
  return Boolean(fromToken && validateUser(fromToken));
}

type RestorePhase = "idle" | "restoring" | "failed";

type RestoreRuntime = {
  blocked: boolean;
  inProgress: boolean;
};

const restoreRuntimeByAudience: Record<AuthSessionRestoreAudience, RestoreRuntime> = {
  admin: { blocked: false, inProgress: false },
  customer: { blocked: false, inProgress: false },
};

function getRuntime(audience: AuthSessionRestoreAudience): RestoreRuntime {
  return restoreRuntimeByAudience[audience];
}

export function resetAuthSessionRestoreState(
  audience?: AuthSessionRestoreAudience,
): void {
  resetAuthSessionRestoreCache();
  if (audience) {
    restoreRuntimeByAudience[audience] = { blocked: false, inProgress: false };
    return;
  }
  for (const key of Object.keys(restoreRuntimeByAudience) as AuthSessionRestoreAudience[]) {
    restoreRuntimeByAudience[key] = { blocked: false, inProgress: false };
  }
}

export function useAuthSessionRestore(
  options: UseAuthSessionRestoreOptions,
): UseAuthSessionRestoreResult {
  const { validateUser, audience = "customer" } = options;
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const sessionValid = hasValidSession(accessToken, user, validateUser);

  const [restorePhase, setRestorePhase] = useState<RestorePhase>("idle");

  const status: AuthSessionRestoreStatus = sessionValid
    ? "ready"
    : restorePhase === "restoring"
      ? "restoring"
      : restorePhase === "failed"
        ? "failed"
        : "checking";

  useEffect(() => {
    const runtime = getRuntime(audience);

    if (sessionValid) {
      runtime.blocked = false;
      runtime.inProgress = false;
      if (accessToken && (!user || !validateUser(user))) {
        const fromToken = buildUserFromAccessToken(accessToken);
        if (fromToken && validateUser(fromToken)) {
          setSession(accessToken, fromToken);
        }
      }
      return;
    }

    if (runtime.blocked) {
      setRestorePhase("failed");
      return;
    }

    if (runtime.inProgress) {
      setRestorePhase("restoring");
      return;
    }

    runtime.inProgress = true;
    setRestorePhase("restoring");

    void restoreAuthSessionFromCookie().then((result) => {
      runtime.inProgress = false;
      if (result.ok && validateUser(result.user)) {
        runtime.blocked = false;
        setSession(result.accessToken, result.user);
        setRestorePhase("idle");
        return;
      }
      runtime.blocked = true;
      clearSession();
      setRestorePhase("failed");
    });
  }, [
    sessionValid,
    accessToken,
    user,
    setSession,
    clearSession,
    validateUser,
    audience,
  ]);

  return { status, accessToken, user };
}
