import { apiClient } from "@/lib/api";

export interface SendOpsSetupOtpInput {
  token: string;
  name: string;
  phone?: string;
}

export interface SendOpsSetupOtpResponse {
  message: string;
  expiresAt: string;
}

export interface ConsumeOpsInviteInput {
  token: string;
  otp: string;
}

export interface ConsumeOpsInviteResponse {
  opsUserId: string;
  email: string;
  name: string;
  permissions: string[];
}

export async function sendOpsSetupOtp(input: SendOpsSetupOtpInput) {
  return apiClient<SendOpsSetupOtpResponse>("/ops/invites/setup/send-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function consumeOpsInvite(input: ConsumeOpsInviteInput) {
  return apiClient<ConsumeOpsInviteResponse>("/ops/invites/consume", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
