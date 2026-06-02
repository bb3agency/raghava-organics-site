"use client";

import { useCallback } from "react";
import type { User } from "@/types/user";
import {
  useAuthSessionRestore,
  type AuthSessionRestoreStatus,
} from "@/hooks/use-auth-session-restore";

export type AccountSessionRestoreStatus = AuthSessionRestoreStatus;

interface UseAccountSessionRestoreResult {
  status: AccountSessionRestoreStatus;
  accessToken: string | null;
  user: User | null;
}

/** Customer account area — any authenticated user with a valid JWT subject. */
export function useAccountSessionRestore(): UseAccountSessionRestoreResult {
  const validateUser = useCallback((candidate: User) => Boolean(candidate.id), []);
  return useAuthSessionRestore({ validateUser, audience: "customer" });
}
