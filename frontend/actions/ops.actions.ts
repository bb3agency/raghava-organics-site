"use server";

import {
  cleanupExpiredOpsInvites,
  createOpsInvite,
  opsApiClient,
  requestOpsOtp,
  saveOpsConfigDraft,
  validateOpsConfigDraft,
  verifyOpsOtp,
} from "@/lib/ops-api";
import { assertOpsUiAccessFromServerAction } from "@/lib/ops-ui-auth";

type OpsDomain = "core" | "payments" | "shipping" | "notifications" | "opsSecurity";

function parseOpsDomain(value: FormDataEntryValue | null): OpsDomain | undefined {
  const domain = String(value ?? "").trim();
  if (!domain) {
    return undefined;
  }
  if (
    domain === "core" ||
    domain === "payments" ||
    domain === "shipping" ||
    domain === "notifications" ||
    domain === "opsSecurity"
  ) {
    return domain;
  }
  throw new Error("Invalid domain.");
}

function parseJsonObject(raw: string): Record<string, string | number | boolean | null> {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Values must be a JSON object.");
    }
    const output: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        output[key] = value;
      }
    }
    return output;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
}

async function guardOpsAction(): Promise<void> {
  await assertOpsUiAccessFromServerAction();
}

export async function requestLoadShedAction(formData: FormData) {
  await guardOpsAction();
  const mode = String(formData.get("mode") ?? "reduced");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    throw new Error("Reason is required.");
  }

  await opsApiClient<{
    requestId: string;
    status: string;
    expiresAt: string;
  }>("/ops/load-shed", {
    method: "POST",
    body: JSON.stringify({ mode, reason }),
  });
}

export async function confirmLoadShedAction(formData: FormData) {
  await guardOpsAction();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) {
    throw new Error("Request ID is required.");
  }

  await opsApiClient(`/ops/approvals/${requestId}/confirm`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectLoadShedAction(formData: FormData) {
  await guardOpsAction();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestId || !reason) {
    throw new Error("Request ID and reason are required.");
  }

  await opsApiClient(`/ops/approvals/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function validateOpsConfigAction(formData: FormData) {
  await guardOpsAction();
  const domain = parseOpsDomain(formData.get("domain"));
  const valuesRaw = String(formData.get("values") ?? "").trim();
  if (!valuesRaw) {
    throw new Error("JSON values are required for validation.");
  }

  const values = parseJsonObject(valuesRaw);
  await validateOpsConfigDraft({ ...(domain ? { domain } : {}), values });
}

export async function requestOpsOtpAction(formData: FormData) {
  await guardOpsAction();
  const action = String(formData.get("action") ?? "").trim();
  if (!action) {
    throw new Error("OTP action label is required.");
  }
  await requestOpsOtp(action);
}

export async function verifyOpsOtpAction(formData: FormData) {
  await guardOpsAction();
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!challengeId || !code) {
    throw new Error("Challenge ID and OTP code are required.");
  }
  await verifyOpsOtp(challengeId, code);
}

export async function saveOpsConfigAction(formData: FormData) {
  await guardOpsAction();
  const domain = parseOpsDomain(formData.get("domain"));
  const valuesRaw = String(formData.get("values") ?? "").trim();
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const otpCode = String(formData.get("otpCode") ?? "").trim();

  if (!domain || !valuesRaw || !challengeId || !otpCode) {
    throw new Error("Domain, JSON values, challenge ID, and OTP code are required.");
  }

  const values = parseJsonObject(valuesRaw);
  await saveOpsConfigDraft({ domain, values, challengeId, otpCode });
}

export async function createOpsInviteAction(formData: FormData) {
  await guardOpsAction();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const setupBaseUrl = String(formData.get("setupBaseUrl") ?? "").trim();
  const permissionsRaw = String(formData.get("permissions") ?? "").trim();
  const ipAllowlistRaw = String(formData.get("ipAllowlist") ?? "").trim();

  if (!email || !name || !setupBaseUrl || !permissionsRaw || !ipAllowlistRaw) {
    throw new Error("Email, name, setupBaseUrl, permissions, and IP allowlist are required.");
  }

  const permissions = permissionsRaw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(
      (value): value is "OPS_READ" | "OPS_WRITE" | "OPS_APPROVE" =>
        value === "OPS_READ" || value === "OPS_WRITE" || value === "OPS_APPROVE",
    );

  const ipAllowlist = ipAllowlistRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (permissions.length === 0 || ipAllowlist.length === 0) {
    throw new Error("At least one permission and one IP CIDR are required.");
  }

  await createOpsInvite({
    email,
    name,
    setupBaseUrl,
    permissions,
    ipAllowlist,
  });
}

export async function cleanupOpsInvitesAction(formData: FormData) {
  await guardOpsAction();
  void formData;
  await cleanupExpiredOpsInvites();
}
