"use client";

import { useAuthStore } from "@/stores/auth";
import type { ReactNode } from "react";
import { isAdminUser } from "@/lib/permissions";

interface AdminSessionProviderProps {
  children: ReactNode;
}

export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const user = useAuthStore((state) => state.user);

  if (!isAdminUser(user)) {
    return null; // The shell handles the redirect
  }

  return <>{children}</>;
}
