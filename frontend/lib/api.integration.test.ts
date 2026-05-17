import { beforeAll, describe, expect, it } from "vitest";
import { apiClient, ApiError } from "@/lib/api";
import type { HealthStatus } from "@/types/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

describe("API client integration (live backend)", () => {
  beforeAll(async () => {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      throw new Error("Backend health endpoint is not reachable for integration tests");
    }
  });

  it("parses health response", async () => {
    const health = await apiClient<HealthStatus>("/health");
    expect(health.status).toBe("ok");
    expect(health.db ?? health.database).toBe("connected");
    expect(health.redis).toBe("connected");
  });

  it("parses product list payload", async () => {
    const result = await apiClient<{ items?: unknown[] } | unknown[]>(
      "/products?page=1&limit=4",
    );
    if (Array.isArray(result)) {
      expect(Array.isArray(result)).toBe(true);
      return;
    }
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("branches errors by code", async () => {
    try {
      await apiClient("/orders/not-a-real-id", {
        accessToken: "invalid-token-for-test",
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.code).toBeTruthy();
      }
    }
  });
});
