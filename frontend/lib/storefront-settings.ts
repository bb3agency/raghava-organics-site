/**
 * Public storefront settings fetched from GET /api/v1/store/config.
 * No auth required. Used by RSC pages (cart, checkout) to enforce
 * minimum order value and COD availability without admin credentials.
 *
 * Uses native fetch with Next.js ISR (revalidate: 60s) so the value is
 * cached at the edge and re-validated in the background — storefront pages
 * won't hit the backend on every request.
 *
 * Falls back to safe env-based defaults if the backend is unreachable,
 * so the storefront never hard-crashes due to a settings fetch failure.
 */

export interface PublicStoreConfig {
  isCodEnabled: boolean;
  /** Minimum cart total in paise. 0 means no minimum. */
  minOrderValuePaise: number;
  /**
   * When false (default), only email+password signup is shown to customers.
   * When true, customers also see the "Sign up with Mobile" OTP tab.
   * Toggled by the merchant from Admin → Settings → Store.
   */
  mobileOtpSignupEnabled: boolean;
}

const DEFAULT_CONFIG: PublicStoreConfig = {
  // Fall back to env flag so the constant in constants.ts keeps working
  // during local dev before the DB row has been created.
  isCodEnabled: process.env.NEXT_PUBLIC_COD_ENABLED !== "false",
  minOrderValuePaise: 0,
  mobileOtpSignupEnabled: false,
};

export async function getPublicStoreConfig(): Promise<PublicStoreConfig> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBase) return DEFAULT_CONFIG;

  try {
    const res = await fetch(`${apiBase}/store/config`, {
      // Revalidate every 60 s — admin changes take effect within a minute.
      // No credentials needed: this endpoint is public.
      next: { revalidate: 60 },
    });

    if (!res.ok) return DEFAULT_CONFIG;

    const body: unknown = await res.json();

    // Handle both enveloped ({ success, data }) and raw responses.
    const data =
      typeof body === "object" &&
      body !== null &&
      "data" in body &&
      typeof (body as Record<string, unknown>).data === "object"
        ? (body as { data: unknown }).data
        : body;

    if (typeof data !== "object" || data === null) return DEFAULT_CONFIG;

    const record = data as Record<string, unknown>;
    return {
      isCodEnabled:
        typeof record.isCodEnabled === "boolean"
          ? record.isCodEnabled
          : DEFAULT_CONFIG.isCodEnabled,
      minOrderValuePaise:
        typeof record.minOrderValuePaise === "number" &&
        record.minOrderValuePaise >= 0
          ? record.minOrderValuePaise
          : DEFAULT_CONFIG.minOrderValuePaise,
      mobileOtpSignupEnabled:
        typeof record.mobileOtpSignupEnabled === "boolean"
          ? record.mobileOtpSignupEnabled
          : false,
    };
  } catch {
    // Network error, backend down, etc. — never crash the storefront.
    return DEFAULT_CONFIG;
  }
}
