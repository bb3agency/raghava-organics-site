import { describe, it, expect } from "vitest";
import {
  getErrorMessage,
  isAuthFailureCode,
  shouldAttemptTokenRefresh,
} from "@/lib/error-messages";
import { ApiError } from "@/lib/api";

describe("error-messages", () => {
  it("maps known codes to copy", () => {
    expect(getErrorMessage("PINCODE_NOT_SERVICEABLE")).toContain("pincode");
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
