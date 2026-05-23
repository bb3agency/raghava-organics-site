"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import type { ReadinessStatus } from "@/types/api";

interface OpsRuntimeReadinessCardProps {
  refreshSignal?: number;
}

export function OpsRuntimeReadinessCard({
  refreshSignal = 0,
}: OpsRuntimeReadinessCardProps) {
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadReadiness = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await apiClient<ReadinessStatus>("/health/ready", {
        cache: "no-store",
      });
      setReadiness(next);
      setError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
      setReadiness(null);
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness, refreshSignal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadReadiness();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [loadReadiness]);

  const isReady = readiness?.status === "ready";
  const missingKeys = readiness?.runtimeConfigMissingKeys ?? [];

  return (
    <section className="rounded-lg border border-border p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Runtime readiness</h3>
        <button
          type="button"
          onClick={() => void loadReadiness()}
          className="h-8 rounded-md border border-border px-3 text-xs"
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : readiness ? (
        <div className="mt-2 grid gap-2 text-sm">
          <p
            className={
              isReady
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }
          >
            Status: {readiness.status} · DB: {readiness.database} · Redis:{" "}
            {readiness.redis} · Queue: {readiness.queues.workerFreshness}
          </p>
          {!isReady && missingKeys.length > 0 ? (
            <p className="text-destructive">
              Missing runtime keys: {missingKeys.join(", ")}
            </p>
          ) : null}
          {isReady ? (
            <p className="text-emerald-700 dark:text-emerald-400">
              All required runtime keys are configured and backend is healthy.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Checking readiness...</p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Last updated:{" "}
        {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"}
      </p>
    </section>
  );
}
