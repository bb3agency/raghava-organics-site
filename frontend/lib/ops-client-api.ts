"use client";

import { apiClient, ApiError } from "@/lib/api";
import type { ReadinessStatus } from "@/types/api";

export type OpsPermission = "ops:read" | "ops:write";

export type OpsOtpActionType =
  | "config-save"
  | "load-shed-change"
  | "user-deactivate"
  | "system-restart"
  | "invite-revoke";

export interface OpsSession {
  id: string;
  email: string;
  name: string;
  permissions: OpsPermission[];
  mfaEnabled: boolean;
  ipAllowlist: string[];
  lastLoginAt: string | null;
}

export interface OpsLoadShedStatus {
  mode: "normal" | "reduced" | "emergency";
}

export interface OpsAuditRecord {
  id: string;
  requestId: string;
  actionType?: string;
  actionStatus: "EXECUTED" | "FAILED";
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

export interface OpsConfigSaveResponse {
  valid: boolean;
  savedKeys: string[];
  domain: "core" | "payments" | "shipping" | "notifications" | "opsSecurity";
  requiresRestart: boolean;
  masked: Array<{ key: string; maskedValue: string }>;
}

export interface OpsInviteListItem {
  id: string;
  inviteEmail: string;
  inviteName: string;
  status: "CREATED" | "EMAIL_SENT" | "CONSUMED" | "CANCELLED" | "EXPIRED_CLEANED";
  expiresAt: string;
  createdAt: string;
}

export interface OpsInviteList {
  items: OpsInviteListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface OpsUserListItem {
  id: string;
  email: string;
  name: string;
  permissions: OpsPermission[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface OpsUserList {
  items: OpsUserListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface OpsPendingOtpItem {
  id: string;
  action: string;
  expiresAt: string;
}

export interface OpsDlqSummary {
  total: number;
  bySourceQueue: Record<string, number>;
}

function buildPath(
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
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function opsFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  return apiClient<T>(endpoint, {
    ...options,
    credentials: "include",
  });
}

function normalizeOpsPermission(value: string): OpsPermission | null {
  const normalized = value.trim().toLowerCase().replace("_", ":");
  if (normalized === "ops:read") {
    return "ops:read";
  }
  if (normalized === "ops:write") {
    return "ops:write";
  }
  return null;
}

function normalizeOpsPermissions(values: string[] | undefined): OpsPermission[] {
  const resolved = new Set<OpsPermission>();
  for (const value of values ?? []) {
    const permission = normalizeOpsPermission(value);
    if (permission) {
      resolved.add(permission);
    }
  }
  return [...resolved];
}

export async function requestOpsLoginOtp(input: {
  email: string;
}): Promise<{ expiresAt: string; message?: string }> {
  return opsFetch("/ops/auth/login/request-otp", {
    method: "POST",
    body: JSON.stringify({ email: input.email }),
  });
}

export async function verifyOpsLoginOtp(input: {
  email: string;
  otp: string;
}): Promise<{
  opsUserId: string;
  name: string;
  email: string;
  permissions: OpsPermission[];
  expiresAt: string;
}> {
  const result = await opsFetch<{
    opsUserId: string;
    name: string;
    email: string;
    permissions: string[];
    expiresAt: string;
  }>("/ops/auth/login/verify-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return {
    ...result,
    permissions: normalizeOpsPermissions(result.permissions),
  };
}

export async function logoutOpsSession(): Promise<{ message: string }> {
  return opsFetch("/ops/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getOpsSessionClient(): Promise<OpsSession> {
  const result = await opsFetch<{
    id: string;
    email: string;
    name: string;
    permissions: string[];
    mfaEnabled: boolean;
    ipAllowlist: string[];
    lastLoginAt: string | null;
  }>("/ops/session");
  return {
    ...result,
    permissions: normalizeOpsPermissions(result.permissions),
  };
}

export async function getOpsLoadShedStatusClient(): Promise<OpsLoadShedStatus> {
  return opsFetch<OpsLoadShedStatus>("/ops/load-shed");
}

export async function setOpsLoadShedMode(input: {
  mode: OpsLoadShedStatus["mode"];
  reason: string;
  challengeId: string;
  otpCode: string;
}): Promise<{ mode: OpsLoadShedStatus["mode"]; updated: boolean }> {
  return opsFetch("/ops/load-shed", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestOpsOtpChallenge(
  action: OpsOtpActionType,
): Promise<OpsOtpChallengeResponse> {
  return opsFetch("/ops/otp/request", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function verifyOpsOtpChallenge(input: {
  challengeId: string;
  code: string;
}): Promise<{ verified: boolean }> {
  return opsFetch("/ops/otp/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId: input.challengeId, code: input.code }),
  });
}

export async function getOpsPendingOtps(): Promise<{ items: OpsPendingOtpItem[] }> {
  return opsFetch("/ops/otp/pending");
}

export async function getOpsConfigOverviewClient(): Promise<OpsConfigOverview> {
  return opsFetch<OpsConfigOverview>("/ops/config/overview");
}

export async function getOpsStoredConfigClient(query?: {
  domain?: OpsStoredConfig["items"][number]["domain"];
}): Promise<OpsStoredConfig> {
  return opsFetch<OpsStoredConfig>(buildPath("/ops/config/stored", query));
}

export async function validateOpsConfigClient(input: {
  domain?: OpsStoredConfig["items"][number]["domain"];
  values: Record<string, string | number | boolean | null>;
}): Promise<OpsConfigValidationResponse> {
  return opsFetch("/ops/config/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveOpsConfigClient(input: {
  domain?: OpsStoredConfig["items"][number]["domain"];
  values: Record<string, string | number | boolean | null>;
  challengeId: string;
  otpCode: string;
}): Promise<OpsConfigSaveResponse> {
  return opsFetch("/ops/config/save", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function getOpsApiBase(): string {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
  return base.replace(/\/$/, "");
}

/** Readiness may return HTTP 503 with payload in envelope `data` when not ready. */
export async function fetchOpsReadinessStatus(): Promise<ReadinessStatus> {
  const url = `${getOpsApiBase()}/health/ready`;
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  const body: unknown = await response.json().catch(() => ({}));

  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof (body as { data: unknown }).data === "object" &&
    (body as { data: { status?: string } }).data?.status
  ) {
    return (body as { data: ReadinessStatus }).data;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    !("success" in body)
  ) {
    return body as ReadinessStatus;
  }

  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Readiness check failed",
      response.status,
    );
  }

  throw new ApiError("UNKNOWN_ERROR", "Readiness check failed", response.status);
}

export async function listOpsInvitesClient(query?: {
  status?: OpsInviteListItem["status"];
  page?: number;
  limit?: number;
}): Promise<OpsInviteList> {
  return opsFetch<OpsInviteList>(buildPath("/ops/invites", query));
}

export async function createOpsInviteClient(input: {
  email: string;
  name: string;
  setupBaseUrl: string;
  ipAllowlist?: string[];
}): Promise<{ inviteId: string; expiresAt: string; setupUrl: string }> {
  return opsFetch("/ops/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeOpsInviteClient(input: {
  inviteId: string;
  challengeId: string;
  otpCode: string;
}): Promise<{ inviteId: string; revoked: boolean }> {
  return opsFetch(`/ops/invites/${input.inviteId}/revoke`, {
    method: "POST",
    body: JSON.stringify({
      challengeId: input.challengeId,
      otpCode: input.otpCode,
    }),
  });
}

export async function cleanupExpiredOpsInvitesClient(): Promise<{ cleaned: number }> {
  return opsFetch("/ops/invites/cleanup-expired", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listOpsUsersClient(query?: {
  page?: number;
  limit?: number;
}): Promise<OpsUserList> {
  const result = await opsFetch<{
    items: Array<{
      id: string;
      email: string;
      name: string;
      permissions: string[];
      isActive: boolean;
      lastLoginAt: string | null;
    }>;
    page: number;
    limit: number;
    total: number;
  }>(buildPath("/ops/users", query));
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      permissions: normalizeOpsPermissions(item.permissions),
    })),
  };
}

export async function deactivateOpsUserClient(input: {
  opsUserId: string;
  reason: string;
  challengeId: string;
  otpCode: string;
}): Promise<{ opsUserId: string; deactivated: boolean }> {
  return opsFetch(`/ops/users/${input.opsUserId}/deactivate`, {
    method: "POST",
    body: JSON.stringify({
      reason: input.reason,
      challengeId: input.challengeId,
      otpCode: input.otpCode,
    }),
  });
}

export async function scheduleOpsSystemRestart(input: {
  delayMinutes: number;
  challengeId: string;
  otpCode: string;
}): Promise<{ jobId: string; scheduledFor: string }> {
  return opsFetch("/ops/system/restart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getOpsAuditLogsClient(query?: {
  actionStatus?: "EXECUTED" | "FAILED";
  actionType?: string;
  opsUserId?: string;
  page?: number;
  limit?: number;
}): Promise<OpsAuditList> {
  return opsFetch<OpsAuditList>(buildPath("/ops/audit/logs", query));
}

export async function getOpsDlqSummaryClient(): Promise<OpsDlqSummary> {
  return opsFetch<OpsDlqSummary>("/ops/queues/dlq/summary");
}

export function getOpsQueuesBoardUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
  return `${base.replace(/\/$/, "")}/ops/queues`;
}

export function isOpsUnauthorisedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
