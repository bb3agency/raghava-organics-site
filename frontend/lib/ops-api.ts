/**
 * Server-only ops helpers (metrics scrape). Authenticated ops calls use
 * `lib/ops-client-api.ts` from the browser with `credentials: "include"`.
 */
import { ApiError } from "@/lib/api";
import { assertOpsUiAccessFromServerAction } from "@/lib/ops-ui-auth";

const OPS_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000/api/v1";

export type {
  OpsSession,
  OpsLoadShedStatus,
  OpsConfigOverview,
  OpsStoredConfig,
} from "@/lib/ops-client-api";

export async function getOpsMetricsSnapshot(): Promise<string> {
  if (typeof window === "undefined") {
    await assertOpsUiAccessFromServerAction();
  }

  const metricsToken = process.env.OPS_METRICS_TOKEN;
  const url = `${OPS_BASE_URL.replace(/\/$/, "")}/ops/metrics`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: metricsToken ? { "x-ops-token": metricsToken } : undefined,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const errorCode =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { code?: string } }).error?.code === "string"
        ? (body as { error: { code: string } }).error.code
        : "UNKNOWN_ERROR";
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Ops metrics request failed";
    throw new ApiError(errorCode, message, response.status);
  }

  return response.text();
}
