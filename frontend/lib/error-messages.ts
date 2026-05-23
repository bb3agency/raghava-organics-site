import { ApiError } from "@/lib/api";

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
    "Required runtime configuration is missing. Complete Ops Config and restart backend/workers.",
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

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
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

export function getApiErrorMessageWithHint(error: unknown): string {
  const message = getApiErrorMessage(error);
  if (error instanceof ApiError) {
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
    if (isConflictErrorCode(error.code) || error.status === 409) {
      return `${message} Do not resubmit the same idempotency key for a new user action.`;
    }
    if (isRetryableErrorCode(error.code)) {
      return `${message} You can safely retry after a short pause.`;
    }
  }
  return message;
}

export function isAuthFailureCode(code: string): boolean {
  return AUTH_FAILURE_CODES.has(code);
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
