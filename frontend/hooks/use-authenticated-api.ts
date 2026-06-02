"use client";

import { useMemo } from "react";
import { createAuthenticatedApiClient } from "@/lib/authenticated-api";
import { redirectToAdminLogin } from "@/lib/admin-auth-navigation";
import { useAuthStore } from "@/stores/auth";

export function useAuthenticatedApi() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const clearSession = useAuthStore((s) => s.clearSession);

  return useMemo(
    () =>
      createAuthenticatedApiClient({
        getAccessToken: () => useAuthStore.getState().accessToken,
        setAccessToken,
        onAuthFailure: () => {
          clearSession();
          const path = window.location.pathname;
          if (path.startsWith("/admin")) {
            redirectToAdminLogin();
          } else {
            window.location.assign("/login");
          }
        },
      }),
    [setAccessToken, clearSession],
  );
}
