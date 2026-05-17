"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createAuthenticatedApiClient } from "@/lib/authenticated-api";
import { useAuthStore } from "@/stores/auth";

export function useAuthenticatedApi() {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const clearSession = useAuthStore((s) => s.clearSession);

  return useMemo(
    () =>
      createAuthenticatedApiClient({
        getAccessToken: () => useAuthStore.getState().accessToken,
        setAccessToken,
        onAuthFailure: () => {
          clearSession();
          router.push("/login");
        },
      }),
    [setAccessToken, clearSession, router],
  );
}
