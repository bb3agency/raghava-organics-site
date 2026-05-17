import { apiClient } from "@/lib/api";
import { parseAccessTokenClaims } from "@/lib/jwt-utils";
import { adminLoginInputSchema, adminMfaCodeSchema } from "@/lib/validators";
import type { AuthSession, User } from "@/types/user";

export interface AdminLoginInput {
  email: string;
  password: string;
  mfaCode?: string;
  turnstileToken?: string;
}

interface AdminLoginApiUser {
  id: string;
  email: string | null;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isVerified: boolean;
}

interface AdminLoginApiResponse {
  accessToken: string;
  admin: AdminLoginApiUser;
}

export interface AdminMfaSetupStartResponse {
  secret: string;
  otpauthUrl: string;
  message: string;
}

function mapAdminUser(admin: AdminLoginApiUser, accessToken: string): User {
  const claims = parseAccessTokenClaims(accessToken);
  const name =
    [admin.firstName, admin.lastName].filter((part) => Boolean(part?.trim())).join(" ") ||
    null;

  return {
    id: admin.id,
    email: admin.email ?? "",
    phone: admin.phone,
    name,
    role: admin.role,
    permissions: claims?.permissions ?? [],
  };
}

export async function loginAdmin(input: AdminLoginInput): Promise<AuthSession> {
  const body = adminLoginInputSchema.parse(input);
  const response = await apiClient<AdminLoginApiResponse>("/auth/admin/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    accessToken: response.accessToken,
    user: mapAdminUser(response.admin, response.accessToken),
  };
}

export async function startAdminMfaSetup(
  accessToken: string,
): Promise<AdminMfaSetupStartResponse> {
  return apiClient<AdminMfaSetupStartResponse>("/auth/admin/mfa/setup/start", {
    method: "POST",
    accessToken,
    body: JSON.stringify({}),
  });
}

export async function confirmAdminMfaSetup(
  accessToken: string,
  mfaCode: string,
): Promise<{ message: string }> {
  const code = adminMfaCodeSchema.parse(mfaCode);
  return apiClient<{ message: string }>("/auth/admin/mfa/setup/confirm", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ mfaCode: code }),
  });
}

export async function disableAdminMfa(
  accessToken: string,
  mfaCode: string,
): Promise<{ message: string }> {
  const code = adminMfaCodeSchema.parse(mfaCode);
  return apiClient<{ message: string }>("/auth/admin/mfa/disable", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ mfaCode: code }),
  });
}
