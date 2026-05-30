"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import {
  buildUserFromAccessToken,
  restoreAuthSessionFromCookie,
} from "@/lib/restore-auth-session";
import type { User } from "@/types/user";

export type AuthSessionRestoreStatus =
  | "checking"
  | "restoring"
  | "ready"
  | "failed";

interface UseAuthSessionRestoreOptions {
  /** Return true when the restored user may access this surface. */
  validateUser: (user: User) => boolean;
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
  if (!accessToken) {
    return false;
  }
  if (user && validateUser(user)) {
    return true;
  }
  const fromToken = buildUserFromAccessToken(accessToken);
  return Boolean(fromToken && validateUser(fromToken));
}

export function useAuthSessionRestore(
  options: UseAuthSessionRestoreOptions,
): UseAuthSessionRestoreResult {
  const { validateUser } = options;
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const restoreBlockedRef = useRef(false);
  const restoreInProgressRef = useRef(false);

  const [status, setStatus] = useState<AuthSessionRestoreStatus>(() =>
    hasValidSession(accessToken, user, validateUser) ? "ready" : "checking",
  );

  useEffect(() => {
    if (hasValidSession(accessToken, user, validateUser)) {
      restoreBlockedRef.current = false;
      restoreInProgressRef.current = false;
      if (accessToken && (!user || !validateUser(user))) {
        const fromToken = buildUserFromAccessToken(accessToken);
        if (fromToken && validateUser(fromToken)) {
          setSession(accessToken, fromToken);
        }
      }
      setStatus("ready");
      return;
    }

    if (restoreBlockedRef.current || restoreInProgressRef.current) {
      if (restoreBlockedRef.current) {
        setStatus("failed");
      }
      return;
    }

    restoreInProgressRef.current = true;
    setStatus("restoring");

    void restoreAuthSessionFromCookie().then((result) => {
      restoreInProgressRef.current = false;
      if (result.ok && validateUser(result.user)) {
        restoreBlockedRef.current = false;
        setSession(result.accessToken, result.user);
        setStatus("ready");
        return;
      }
      restoreBlockedRef.current = true;
      clearSession();
      setStatus("failed");
    });
  }, [accessToken, user, setSession, clearSession, validateUser]);

  return { status, accessToken, user };
}
