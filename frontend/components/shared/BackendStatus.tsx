import { apiClient, ApiError } from "@/lib/api";
import type { HealthStatus } from "@/types/api";

interface BackendStatusProps {
  className?: string;
}

export async function BackendStatus({ className }: BackendStatusProps) {
  let health: HealthStatus | null = null;
  let message: string | null = null;

  try {
    health = await apiClient<HealthStatus>("/health", {
      cache: "no-store",
    });
  } catch (error) {
    message =
      error instanceof ApiError
        ? `API error (${error.code})`
        : "Backend unreachable — start `npm run dev:e2e` in ../backend";
  }

  if (!health) {
    return (
      <p
        className={`text-sm text-destructive ${className ?? ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    );
  }

  const dbStatus = health.db ?? health.database ?? "unknown";
  const ok =
    health.status === "ok" && dbStatus === "connected" && health.redis === "connected";

  return (
    <div className={className} role="status" aria-live="polite">
      <p
        className={
          ok
            ? "text-sm text-emerald-700 dark:text-emerald-400"
            : "text-sm text-amber-700 dark:text-amber-400"
        }
      >
        Backend: {health.status} · DB: {dbStatus} · Redis: {health.redis}
      </p>
    </div>
  );
}
