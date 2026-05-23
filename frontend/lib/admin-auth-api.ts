import { apiClient } from "@/lib/api";
import { parseAccessTokenClaims } from "@/lib/jwt-utils";
import { emailSchema, otpSchema, passwordSchema } from "@/lib/validators";
import { z } from "zod";
import type { AuthSession, User } from "@/types/user";

const adminLoginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: z.string().max(4096).optional(),
});

const adminLoginVerifySchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

interface AdminLoginApiUser {
  id: string;
  email: string | null;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isVerified: boolean;
}

interface AdminLoginVerifyResponse {
  accessToken: string;
  admin: AdminLoginApiUser;
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

export async function requestAdminLoginOtp(
  input: z.infer<typeof adminLoginRequestSchema>,
): Promise<{ expiresAt: string; message?: string }> {
  const body = adminLoginRequestSchema.parse(input);
  return apiClient("/auth/admin/login/request-otp", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function verifyAdminLoginOtp(
  input: z.infer<typeof adminLoginVerifySchema>,
): Promise<AuthSession> {
  const body = adminLoginVerifySchema.parse(input);
  const response = await apiClient<AdminLoginVerifyResponse>(
    "/auth/admin/login/verify-otp",
    {
      method: "POST",
      body: JSON.stringify(body),
      credentials: "include",
    },
  );

  return {
    accessToken: response.accessToken,
    user: mapAdminUser(response.admin, response.accessToken),
  };
}
