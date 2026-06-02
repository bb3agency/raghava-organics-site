import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { redirectToAdminHome, redirectToAdminLogin } from "@/lib/admin-auth-navigation";

describe("admin-auth-navigation", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockClear();
    vi.stubGlobal("window", { location: { assign } } as unknown as Window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to admin login", () => {
    redirectToAdminLogin();
    expect(assign).toHaveBeenCalledWith("/admin/login");
  });

  it("redirects to admin home", () => {
    redirectToAdminHome();
    expect(assign).toHaveBeenCalledWith("/admin");
  });
});
