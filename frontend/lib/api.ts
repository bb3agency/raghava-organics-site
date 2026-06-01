import { resolveApiBaseUrl } from "@/lib/api-base";
import type { ApiEnvelope, ApiErrorBody } from "@/types/api";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: ApiErrorBody["details"],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions extends RequestInit {
  accessToken?: string | null;
  idempotencyKey?: string;
}

function getApiBase(): string {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Configure frontend/.env.local.",
    );
  }
  return base;
}

function isEnvelope<T>(body: unknown): body is ApiEnvelope<T> {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    "data" in body
  );
}

function parseApiError(body: unknown, status: number): ApiError {
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error?: ApiErrorBody }).error;
    return new ApiError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Request failed",
      status,
      err?.details,
    );
  }
  return new ApiError("UNKNOWN_ERROR", "Request failed", status);
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { accessToken, idempotencyKey, headers, ...init } = options;
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${getApiBase()}${path}`;

  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...headers,
    },
  });

  const body: unknown = await response.json().catch(() => ({}));

  if (isEnvelope<T>(body)) {
    if (!body.success) {
      throw parseApiError(body, response.status);
    }
    return body.data as T;
  }

  if (!response.ok) {
    throw parseApiError(body, response.status);
  }

  return body as T;
}
