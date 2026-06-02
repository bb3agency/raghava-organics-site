import { ApiError } from "@/lib/api";
import { isTurnstileConfigured } from "@/lib/turnstile-config";

/** User-facing copy keyed by backend `error.code` — never branch on message text. */
const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Please check the highlighted fields and try again.",
  TOKEN_EXPIRED: "Your session expired. Please sign in again.",
  UNAUTHORISED: "Please sign in to continue.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  FORBIDDEN: "You do not have permission to perform this action.",
  ADMIN_MFA_SETUP_REQUIRED:
    "Multi-factor authentication must be enabled before you can sign in. If enforcement was just turned on, ask your operator to complete MFA enrollment or temporarily disable ADMIN_MFA_ENFORCE for first-time setup.",
  ADMIN_MFA_CODE_REQUIRED: "Enter the 6-digit code from your authenticator app.",
  NOT_FOUND: "The requested item could not be found.",
  CONFLICT:
    "This action conflicts with the current state. Refresh the page and retry only if you are starting a new action.",
  IDEMPOTENCY_CONFLICT:
    "This request was already processed. Refresh to see the latest state before retrying.",
  ops_audit_chain_lock_timeout:
    "Ops audit system is busy. Wait 1–2 seconds and retry this action.",
  INVALID_STATUS_TRANSITION: "This status change is not allowed right now.",
  INSUFFICIENT_STOCK: "Not enough stock is available for this quantity.",
  PINCODE_NOT_SERVICEABLE: "Delivery is not available for this pincode. Try another address.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait a moment and try again.",
  ORDER_NOT_FOUND: "Order not found.",
  CONFIG_NOT_READY:
    "Runtime configuration is incomplete. Save the missing keys below, then restart API and workers.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
};

const RETRYABLE_CODES = new Set([
  "RATE_LIMIT_EXCEEDED",
  "INTERNAL_ERROR",
  "UNKNOWN_ERROR",
  "ops_audit_chain_lock_timeout",
]);

const CONFLICT_CODES = new Set(["CONFLICT", "IDEMPOTENCY_CONFLICT"]);

const AUTH_FAILURE_CODES = new Set([
  "UNAUTHORISED",
  "INVALID_CREDENTIALS",
  "TOKEN_EXPIRED",
]);

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}

export function getAdminLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CREDENTIALS") {
      const message = (error.message ?? "").toLowerCase();
      if (message.includes("otp") || message.includes("login code") || message.includes("one-time")) {
        return "That login code is invalid or has expired. Request a new code and try again.";
      }
      return "Incorrect password.";
    }
    if (
      error.status === 403 &&
      error.message.toLowerCase().includes("mfa setup is required")
    ) {
      return ERROR_MESSAGES.ADMIN_MFA_SETUP_REQUIRED;
    }
    if (
      error.status === 401 &&
      error.message.toLowerCase().includes("mfa code is required")
    ) {
      return ERROR_MESSAGES.ADMIN_MFA_CODE_REQUIRED;
    }
    if (error.status === 401 && error.message.toLowerCase().includes("mfa code")) {
      return "The authenticator code is invalid. Try again.";
    }
  }
  return getApiErrorMessage(error);
}

function getAuthChallengeErrorMessage(error: ApiError): string | null {
  const message = (error.message ?? "").toLowerCase();
  if (
    error.code !== "VALIDATION_ERROR" ||
    (!message.includes("challenge") && !message.includes("turnstile"))
  ) {
    return null;
  }
  if (!isTurnstileConfigured()) {
    return (
      "The API requires a security check, but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set. " +
      "Add the Cloudflare site key to frontend/.env.local (must pair with backend TURNSTILE_SECRET_KEY), " +
      "or clear TURNSTILE_SECRET_KEY in backend/.env for local development."
    );
  }
  return "Complete the security check below, then try again.";
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const challengeMessage = getAuthChallengeErrorMessage(error);
    if (challengeMessage) {
      return challengeMessage;
    }
    return getErrorMessage(error.code);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

export function isRetryableErrorCode(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}

export function isConflictErrorCode(code: string): boolean {
  return CONFLICT_CODES.has(code) || code === "CONFLICT";
}

const GENERIC_BACKEND_MESSAGES = new Set([
  "Internal server error",
  "Request validation failed",
  "Rate limit exceeded",
  "",
]);

function readHintKey(error: ApiError): string | undefined {
  if (
    typeof error.details === "object" &&
    error.details !== null &&
    "hintKey" in (error.details as Record<string, unknown>)
  ) {
    const value = (error.details as { hintKey?: unknown }).hintKey;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export function getApiErrorMessageWithHint(error: unknown): string {
  if (error instanceof ApiError) {
    const serverMessage = (error.message ?? "").trim();
    if (
      serverMessage &&
      !GENERIC_BACKEND_MESSAGES.has(serverMessage) &&
      (error.code === "CONFLICT" || error.code === "VALIDATION_ERROR")
    ) {
      return serverMessage;
    }
  }
  const message = getApiErrorMessage(error);
  if (error instanceof ApiError) {
    const hintKey = readHintKey(error);
    if (
      hintKey === "ops_otp_challenge_not_pending" ||
      hintKey === "ops_otp_challenge_consumed_concurrently"
    ) {
      return "Your OTP code has already been used or is no longer valid. Click \"Send OTP to email\" to request a new code, then retry.";
    }
    if (hintKey === "ops_restart_queue_unavailable") {
      return "Restart queue is not available. Backend must be restarted manually (docker compose up -d backend workers) and BullMQ + Redis verified healthy before retrying.";
    }
    if (hintKey === "ops_restart_enqueue_failed") {
      return "Unable to schedule restart because the cart-cleanup queue rejected the job. Check workers and Redis health, then retry.";
    }
    if (hintKey === "ops_restart_load_shed_set_failed") {
      return "Unable to schedule restart because load-shed state could not be updated. Check Redis health and retry.";
    }
    if (hintKey === "ops_restart_audit_failed") {
      return "Unable to schedule restart because the audit record could not be written. Check Postgres connectivity and retry.";
    }
    if (error.code === "CONFIG_NOT_READY") {
      const fields = error.details?.fields ?? [];
      const missingKeys = fields
        .map((item) => item.field)
        .filter((field) => typeof field === "string" && field.trim().length > 0);
      if (missingKeys.length > 0) {
        return `${message} Missing keys: ${missingKeys.join(", ")}.`;
      }
      return message;
    }
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return `${message} Do not resubmit the same idempotency key for a new user action.`;
    }
    if (isRetryableErrorCode(error.code)) {
      return `${message} You can safely retry after a short pause.`;
    }
  }
  return message;
}

/**
 * Returns a secondary diagnostic line for ops/admin operators with the actual
 * backend `error.message` whenever it's specific enough to be useful. Returns
 * `null` for generic backend messages (e.g. "Internal server error") so the UI
 * doesn't render redundant noise. Operators are trusted, so it's safe to show
 * AppError messages (they're crafted by us, not raw stack traces).
 */
export function getOpsErrorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const trimmed = (error.message ?? "").trim();
  if (!trimmed || GENERIC_BACKEND_MESSAGES.has(trimmed)) {
    return null;
  }
  const hintKey = readHintKey(error);
  const parts: string[] = [`Server: ${trimmed}`];
  if (hintKey && hintKey !== "internal_error" && hintKey !== "request_failed") {
    parts.push(`hint=${hintKey}`);
  }
  parts.push(`code=${error.code}`);
  return parts.join(" · ");
}

export function isAuthFailureCode(code: string): boolean {
  return AUTH_FAILURE_CODES.has(code);
}

/**
 * Returns true if the error indicates the operator's OTP challenge can no
 * longer be used (already verified, expired, or concurrently consumed) and
 * the UI should clear the challenge/OTP state so the user requests a fresh
 * code instead of resubmitting the same one.
 */
export function isOpsOtpChallengeConsumed(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  const hintKey = readHintKey(error);
  if (
    hintKey === "ops_otp_challenge_not_pending" ||
    hintKey === "ops_otp_challenge_consumed_concurrently"
  ) {
    return true;
  }
  // Backstop: any CONFLICT 409 on an ops critical-OTP route means the
  // challenge is no longer usable (verifyEmailOtp is the only 409-producing
  // step before the action runs). Treat it the same way even if the backend
  // hasn't been redeployed with the new hint keys yet.
  return error.status === 409 && error.code === "CONFLICT";
}

export function shouldAttemptTokenRefresh(error: ApiError): boolean {
  return (
    error.status === 401 &&
    (error.code === "TOKEN_EXPIRED" || error.code === "UNAUTHORISED")
  );
}

export function shouldForceLogin(error: ApiError): boolean {
  return (
    error.status === 401 &&
    (error.code === "UNAUTHORISED" || error.code === "INVALID_CREDENTIALS")
  );
}

export function isApiErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
