import { refreshAccessToken } from "@/lib/auth-api";
import { parseAccessTokenClaims } from "@/lib/jwt-utils";
import type { User } from "@/types/user";

export type AuthSessionRestoreResult =
  | { ok: true; accessToken: string; user: User }
  | { ok: false; reason: "unauthorised" | "invalid_token" };

export function buildUserFromAccessToken(accessToken: string): User | null {
  const claims = parseAccessTokenClaims(accessToken);
  if (!claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email: null,
    phone: null,
    firstName: null,
    lastName: null,
    isVerified: true,
    role: claims.role ?? undefined,
    permissions: claims.permissions ?? [],
  };
}

let refreshInFlight: Promise<{ accessToken: string }> | null = null;

/** Brief cache so React Strict Mode remount does not rotate the refresh token twice. */
let recentRefresh: { accessToken: string; expiresAt: number } | null = null;

const REFRESH_RESULT_CACHE_MS = 3_000;

function refreshAccessTokenOnce(): Promise<{ accessToken: string }> {
  const now = Date.now();
  if (recentRefresh && recentRefresh.expiresAt > now) {
    return Promise.resolve({ accessToken: recentRefresh.accessToken });
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken()
      .then((response) => {
        recentRefresh = {
          accessToken: response.accessToken,
          expiresAt: Date.now() + REFRESH_RESULT_CACHE_MS,
        };
        return response;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * Restores any authenticated session from the httpOnly refresh_token cookie.
 * Single in-flight refresh so React Strict Mode cannot consume the token twice.
 */
export async function restoreAuthSessionFromCookie(): Promise<AuthSessionRestoreResult> {
  try {
    const refreshed = await refreshAccessTokenOnce();
    const user = buildUserFromAccessToken(refreshed.accessToken);
    if (!user) {
      return { ok: false, reason: "invalid_token" };
    }
    return { ok: true, accessToken: refreshed.accessToken, user };
  } catch {
    return { ok: false, reason: "unauthorised" };
  }
}

/** Clears the in-flight refresh cache (e.g. on logout). */
export function resetAuthSessionRestoreCache(): void {
  refreshInFlight = null;
  recentRefresh = null;
}
