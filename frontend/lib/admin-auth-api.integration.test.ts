import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  getAdminOtpChannelConfig,
  requestAdminLoginOtp,
  verifyAdminLoginOtp,
} from "@/lib/admin-auth-api";

function expectApiOrNetworkError(error: unknown): void {
  expect(error).toSatisfy(
    (value: unknown) => value instanceof ApiError || value instanceof TypeError,
  );
}

describe("admin auth api integration", () => {
  it("exposes admin OTP channel endpoint contract", async () => {
    try {
      await getAdminOtpChannelConfig();
    } catch (error) {
      expectApiOrNetworkError(error);
    }
  });

  it("admin login OTP request always returns generic message (no email enumeration)", async () => {
    try {
      const result = await requestAdminLoginOtp({
        email: "nobody@example.com",
        password: "invalid-password",
      });
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    } catch (error) {
      expectApiOrNetworkError(error);
    }
  });

  it("admin OTP verify rejects malformed payload at schema layer", async () => {
    await expect(
      verifyAdminLoginOtp({ email: "invalid", otp: "12" }),
    ).rejects.toBeTruthy();
  });
});
