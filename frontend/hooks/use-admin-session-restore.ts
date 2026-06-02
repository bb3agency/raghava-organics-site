"use client";

import { useCallback } from "react";
import { isAdminUser } from "@/lib/permissions";
import type { User } from "@/types/user";
import {
  useAuthSessionRestore,
  type AuthSessionRestoreStatus,
} from "@/hooks/use-auth-session-restore";

export type AdminSessionRestoreStatus = AuthSessionRestoreStatus;

interface UseAdminSessionRestoreResult {
  status: AdminSessionRestoreStatus;
  accessToken: string | null;
  user: User | null;
}

export function useAdminSessionRestore(): UseAdminSessionRestoreResult {
  const validateUser = useCallback((candidate: User) => isAdminUser(candidate), []);
  return useAuthSessionRestore({ validateUser, audience: "admin" });
}
