"use client";

import { useEffect, useRef } from "react";
import { refreshAccessToken } from "@/lib/auth-api";
import { getCurrentUser } from "@/lib/users-api";
import { useAuthStore } from "@/stores/auth";

export function useSessionBootstrap() {
  const hasBootstrapped = useRef(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    if (hasBootstrapped.current || accessToken) {
      return;
    }
    hasBootstrapped.current = true;

    async function bootstrap() {
      try {
        const refreshed = await refreshAccessToken();
        const user = await getCurrentUser(refreshed.accessToken);
        setSession(refreshed.accessToken, user);
      } catch {
        clearSession();
      }
    }

    void bootstrap();
  }, [accessToken, clearSession, setSession]);
}
