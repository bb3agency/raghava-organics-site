import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  loginWithEmail,
  refreshAccessToken,
  sendOtp,
  verifyOtp,
} from "@/lib/auth-api";

describe("auth api integration", () => {
  it("rejects malformed otp payload at client schema layer", async () => {
    await expect(
      verifyOtp({ phone: "123", otp: "12" }),
    ).rejects.toBeTruthy();
  });

  it("returns structured error for refresh without cookie", async () => {
    try {
      await refreshAccessToken();
      expect.fail("Expected refresh to fail without a valid cookie");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.status).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("auth endpoints return API errors for invalid credentials", async () => {
    await expect(
      loginWithEmail({
        email: "nobody@example.com",
        password: "invalid-password",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      sendOtp({
        phone: "99999",
        channel: "sms",
      }),
    ).rejects.toBeTruthy();
  });
});
