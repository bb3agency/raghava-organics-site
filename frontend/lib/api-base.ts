/**
 * API base URL resolution.
 *
 * Browser auth cookies (`refresh_token`) are set on the request origin.
 * Per backend docs, the storefront must call `/api/v1` on the **same site** as the
 * UI (Next.js rewrite → backend in local dev; Nginx in production).
 */

const API_V1_PATH = "/api/v1";

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export function getConfiguredPublicApiBaseUrl(): string {
  return normalizeBase(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1",
  );
}

export function getInternalApiBaseUrl(): string {
  const internal = process.env.INTERNAL_API_BASE_URL?.trim();
  if (internal) {
    return normalizeBase(internal);
  }
  return getConfiguredPublicApiBaseUrl();
}

/**
 * Base URL for browser `fetch` (client components, credentials: include).
 * Rewrites misconfigured cross-port local URLs to the current page origin.
 */
export function getBrowserApiBaseUrl(): string {
  const configured = getConfiguredPublicApiBaseUrl();

  if (configured.startsWith("/")) {
    return configured;
  }

  if (typeof window === "undefined") {
    return getInternalApiBaseUrl();
  }

  try {
    const apiUrl = new URL(configured);
    const pageUrl = new URL(window.location.href);
    const apiPath = apiUrl.pathname.replace(/\/$/, "");
    const usesApiV1 =
      apiPath === API_V1_PATH || apiPath.endsWith(API_V1_PATH);

    if (usesApiV1 && apiUrl.origin !== pageUrl.origin) {
      return `${pageUrl.origin}${API_V1_PATH}`;
    }
  } catch {
    return configured;
  }

  return configured;
}

/**
 * Base URL for Server Components, server actions, and Vitest integration tests.
 * Always prefers INTERNAL_API_BASE_URL so SSR/tests hit Fastify directly (not the Next rewrite).
 */
export function getServerApiBaseUrl(): string {
  return getInternalApiBaseUrl();
}

/** Context-aware resolver used by `apiClient`. */
export function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return getBrowserApiBaseUrl();
  }
  return getServerApiBaseUrl();
}
