import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserApiBaseUrl,
  getConfiguredPublicApiBaseUrl,
  getServerApiBaseUrl,
} from "@/lib/api-base";

describe("api-base", () => {
  const originalPublic = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalInternal = process.env.INTERNAL_API_BASE_URL;

  afterEach(() => {
    if (originalPublic === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublic;
    }
    if (originalInternal === undefined) {
      delete process.env.INTERNAL_API_BASE_URL;
    } else {
      process.env.INTERNAL_API_BASE_URL = originalInternal;
    }
    vi.unstubAllGlobals();
  });

  it("normalizes configured public base", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3101/api/v1/";
    expect(getConfiguredPublicApiBaseUrl()).toBe("http://localhost:3101/api/v1");
  });

  it("rewrites cross-origin local API URL to page origin for cookies", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3000/api/v1";
    vi.stubGlobal("window", {
      location: { href: "http://localhost:3101/admin" },
    } as Window & typeof globalThis);

    expect(getBrowserApiBaseUrl()).toBe("http://localhost:3101/api/v1");
  });

  it("keeps same-origin configured URL unchanged", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3101/api/v1";
    vi.stubGlobal("window", {
      location: { href: "http://localhost:3101/admin" },
    } as Window & typeof globalThis);

    expect(getBrowserApiBaseUrl()).toBe("http://localhost:3101/api/v1");
  });

  it("server resolver prefers INTERNAL_API_BASE_URL over public storefront URL", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3101/api/v1";
    process.env.INTERNAL_API_BASE_URL = "http://127.0.0.1:3000/api/v1";
    expect(getServerApiBaseUrl()).toBe("http://127.0.0.1:3000/api/v1");
  });
});
