import { describe, it, expect } from "vitest";
import {
  getErrorMessage,
  getApiErrorMessageWithHint,
  isAuthFailureCode,
  shouldAttemptTokenRefresh,
} from "@/lib/error-messages";
import { ApiError } from "@/lib/api";

describe("error-messages", () => {
  it("maps known codes to copy", () => {
    expect(getErrorMessage("PINCODE_NOT_SERVICEABLE")).toContain("pincode");
  });

  it("includes missing keys hint for CONFIG_NOT_READY", () => {
    const err = new ApiError("CONFIG_NOT_READY", "missing runtime config", 503, {
      fields: [
        { field: "PAYMENT_PROVIDER" },
        { field: "RAZORPAY_KEY_ID" },
      ],
    });
    expect(getApiErrorMessageWithHint(err)).toContain("Missing keys");
    expect(getApiErrorMessageWithHint(err)).toContain("PAYMENT_PROVIDER");
  });

  it("identifies auth failure codes", () => {
    expect(isAuthFailureCode("UNAUTHORISED")).toBe(true);
    expect(isAuthFailureCode("CONFLICT")).toBe(false);
  });

  it("detects token refresh eligibility", () => {
    const err = new ApiError("TOKEN_EXPIRED", "expired", 401);
    expect(shouldAttemptTokenRefresh(err)).toBe(true);
  });
});
