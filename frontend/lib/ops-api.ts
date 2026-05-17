import { ApiError } from "@/lib/api";
import { assertOpsUiAccessFromServerAction } from "@/lib/ops-ui-auth";

const OPS_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000/api/v1";

function getOpsHeaders(): HeadersInit {
  const keyId = process.env.OPS_API_KEY_ID;
  const apiKey = process.env.OPS_API_KEY;
  const mfaCode = process.env.OPS_MFA_CODE;

  if (!keyId || !apiKey) {
    throw new Error(
      "OPS_API_KEY_ID/OPS_API_KEY are not configured for ops control-plane calls.",
    );
  }

  return {
    "Content-Type": "application/json",
    "x-ops-key-id": keyId,
    "x-ops-api-key": apiKey,
    ...(mfaCode ? { "x-ops-mfa-code": mfaCode } : {}),
  };
}

function buildOpsPath(
  endpoint: string,
  query?: Record<string, string | number | undefined>,
): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function opsApiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  if (typeof window === "undefined") {
    await assertOpsUiAccessFromServerAction();
  }

  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${OPS_BASE_URL.replace(/\/$/, "")}${path}`;

  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...getOpsHeaders(),
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  const isEnvelope =
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    "data" in body;

  if (isEnvelope) {
    const envelope = body as {
      success: boolean;
      data: T;
      error?: { code?: string; message?: string };
    };
    if (!envelope.success) {
      throw new ApiError(
        envelope.error?.code ?? "UNKNOWN_ERROR",
        envelope.error?.message ?? "Ops request failed",
        response.status,
      );
    }
    return envelope.data;
  }

  if (!response.ok) {
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
        : "Ops request failed";
    throw new ApiError(errorCode, message, response.status);
  }

  return body as T;
}

export interface OpsSession {
  id: string;
  email: string;
  name: string;
  permissions: string[];
  mfaEnabled: boolean;
  ipAllowlist: string[];
  lastLoginAt: string | null;
}

export interface OpsLoadShedStatus {
  mode: "normal" | "reduced" | "emergency";
}

export interface OpsApprovalRecord {
  requestId: string;
  requesterId: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
  payload: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  confirmerId: string | null;
  confirmedAt: string | null;
}

export interface OpsApprovalList {
  items: OpsApprovalRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface OpsAuditRecord {
  id: string;
  requestId: string;
  actionStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
  requestPath: string;
  method: string;
  summary: Record<string, unknown> | null;
  createdAt: string;
}

export interface OpsAuditList {
  items: OpsAuditRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface OpsConfigOverview {
  generatedAt: string;
  runtimeProfile: "development-like" | "production-like";
  domains: Array<{
    domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
    label: string;
    items: Array<{
      key: string;
      present: boolean;
      placeholder: boolean;
      mutableViaOps: boolean;
      requiresRestart: boolean;
      runtimeSource?: "env-bootstrap" | "db-overlay";
      note?: string;
    }>;
  }>;
  strictProfileHealth: {
    noPlaceholdersInStrict: boolean;
    missingRequiredKeysInStrict: string[];
  };
}

export interface OpsStoredConfig {
  items: Array<{
    domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
    key: string;
    maskedValue: string;
    keyVersion: number;
    requiresRestart: boolean;
    updatedAt: string;
  }>;
}

export interface OpsConfigValidationResponse {
  valid: boolean;
  domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity" | null;
  checkedKeys: string[];
  errors: Array<{ key: string; code: string; message: string }>;
  warnings: Array<{ key: string; code: string; message: string }>;
  requiresRestart: boolean;
}

export interface OpsOtpChallengeResponse {
  challengeId: string;
  expiresAt: string;
}

export interface OpsOtpVerifyResponse {
  verified: boolean;
}

export interface OpsConfigSaveResponse {
  valid: boolean;
  savedKeys: string[];
  domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
  requiresRestart: boolean;
  masked: Array<{ key: string; maskedValue: string }>;
}

export interface OpsInviteResponse {
  inviteId: string;
  expiresAt: string;
  setupUrl: string;
}

export interface OpsInviteCleanupResponse {
  cleaned: number;
}

export async function getOpsSession() {
  return opsApiClient<OpsSession>("/ops/session");
}

export async function getOpsLoadShedStatus() {
  return opsApiClient<OpsLoadShedStatus>("/ops/load-shed");
}

export async function getOpsApprovals(query?: {
  status?: OpsApprovalRecord["status"];
  page?: number;
  limit?: number;
}) {
  return opsApiClient<OpsApprovalList>(buildOpsPath("/ops/approvals", query));
}

export async function getOpsAuditLogs(query?: {
  actionStatus?: OpsAuditRecord["actionStatus"];
  page?: number;
  limit?: number;
}) {
  return opsApiClient<OpsAuditList>(buildOpsPath("/ops/audit/logs", query));
}

export async function getOpsConfigOverview() {
  return opsApiClient<OpsConfigOverview>("/ops/config/overview");
}

export async function getOpsStoredConfig(query?: {
  domain?: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
}) {
  return opsApiClient<OpsStoredConfig>(buildOpsPath("/ops/config/stored", query));
}

export async function validateOpsConfigDraft(input: {
  domain?: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
  values: Record<string, string | number | boolean | null>;
}) {
  return opsApiClient<OpsConfigValidationResponse>("/ops/config/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestOpsOtp(action: string) {
  return opsApiClient<OpsOtpChallengeResponse>("/ops/otp/request", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function verifyOpsOtp(challengeId: string, code: string) {
  return opsApiClient<OpsOtpVerifyResponse>("/ops/otp/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export async function saveOpsConfigDraft(input: {
  domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
  values: Record<string, string | number | boolean | null>;
  challengeId: string;
  otpCode: string;
}) {
  return opsApiClient<OpsConfigSaveResponse>("/ops/config/save", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createOpsInvite(input: {
  email: string;
  name: string;
  permissions: Array<"OPS_READ" | "OPS_WRITE" | "OPS_APPROVE">;
  ipAllowlist: string[];
  setupBaseUrl: string;
}) {
  return opsApiClient<OpsInviteResponse>("/ops/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cleanupExpiredOpsInvites() {
  return opsApiClient<OpsInviteCleanupResponse>("/ops/invites/cleanup-expired", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getOpsMetricsSnapshot() {
  if (typeof window === "undefined") {
    await assertOpsUiAccessFromServerAction();
  }

  const path = buildOpsPath("/ops/metrics");
  const url = `${OPS_BASE_URL.replace(/\/$/, "")}${path}`;
  const metricsToken = process.env.OPS_METRICS_TOKEN;
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
