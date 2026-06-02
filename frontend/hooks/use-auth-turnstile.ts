"use client";

import { useCallback, useMemo, useState } from "react";
import { isTurnstileConfigured } from "@/lib/turnstile-config";

export function useAuthTurnstile() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const required = isTurnstileConfigured();

  const onTurnstileTokenChange = useCallback((token: string | null) => {
    setTurnstileToken(token);
    if (token) {
      setLoadError(null);
    }
  }, []);

  const ready = !required || Boolean(turnstileToken);

  const turnstileField = useMemo(
    () => (turnstileToken ? { turnstileToken } : {}),
    [turnstileToken],
  );

  return {
    required,
    ready,
    turnstileToken,
    turnstileField,
    onTurnstileTokenChange,
    turnstileLoadError: loadError,
    setTurnstileLoadError: setLoadError,
  };
}
