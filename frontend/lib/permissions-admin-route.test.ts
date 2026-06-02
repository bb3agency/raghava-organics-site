import { describe, expect, it } from "vitest";
import { canViewAdminPath, resolveAdminRouteFromPathname } from "@/lib/permissions";

describe("admin route permissions", () => {
  const inventoryOnly = {
    role: "STAFF" as const,
    permissions: ["inventory:read"],
  };

  it("resolves inventory path", () => {
    expect(resolveAdminRouteFromPathname("/admin/inventory")).toBe("inventory");
  });

  it("denies orders path for inventory-only staff", () => {
    expect(canViewAdminPath(inventoryOnly, "/admin/orders")).toBe(false);
  });

  it("allows inventory path for inventory-only staff", () => {
    expect(canViewAdminPath(inventoryOnly, "/admin/inventory")).toBe(true);
  });

  it("allows dashboard for inventory staff via prefix rule", () => {
    expect(canViewAdminPath(inventoryOnly, "/admin")).toBe(true);
  });
});
