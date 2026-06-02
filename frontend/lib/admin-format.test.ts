import { describe, expect, it } from "vitest";
import {
  couponStatusTone,
  formatPaise,
  orderStatusTone,
  paymentStatusTone,
  returnStatusTone,
  reviewApprovalTone,
} from "@/lib/admin-format";

describe("admin-format", () => {
  it("formats paise as INR", () => {
    expect(formatPaise(19900)).toMatch(/199/);
  });

  it("maps order status tones", () => {
    expect(orderStatusTone("DELIVERED")).toBe("success");
    expect(orderStatusTone("CANCELLED")).toBe("destructive");
    expect(orderStatusTone("UNKNOWN")).toBe("default");
  });

  it("maps payment status tones", () => {
    expect(paymentStatusTone("captured")).toBe("success");
    expect(paymentStatusTone("failed")).toBe("destructive");
  });

  it("maps return status tones", () => {
    expect(returnStatusTone("REQUESTED")).toBe("warning");
    expect(returnStatusTone("REFUNDED")).toBe("success");
  });

  it("maps coupon status tones", () => {
    expect(couponStatusTone("active")).toBe("success");
    expect(couponStatusTone("paused")).toBe("warning");
  });

  it("maps review approval tones", () => {
    expect(reviewApprovalTone(true)).toBe("success");
    expect(reviewApprovalTone(false)).toBe("warning");
  });
});
