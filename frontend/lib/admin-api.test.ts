import { describe, expect, it } from "vitest";
import { buildAdminQuery, normalizePagination } from "@/lib/admin-api";

describe("buildAdminQuery", () => {
  it("builds query string from params", () => {
    expect(buildAdminQuery({ page: 2, limit: 20 })).toBe("?page=2&limit=20");
  });

  it("omits undefined and empty values", () => {
    expect(buildAdminQuery({ page: 1, search: "" })).toBe("?page=1");
  });

  it("serializes boolean params", () => {
    expect(buildAdminQuery({ approved: false })).toBe("?approved=false");
  });

  it("returns empty string when no params", () => {
    expect(buildAdminQuery({})).toBe("");
  });
});

describe("normalizePagination", () => {
  it("returns meta when present", () => {
    expect(
      normalizePagination({
        items: [],
        meta: { page: 2, limit: 10, total: 25, totalPages: 3 },
      }),
    ).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
  });

  it("derives meta from flat pagination fields", () => {
    expect(
      normalizePagination({ items: [], total: 40, page: 2, limit: 20 }),
    ).toEqual({ page: 2, limit: 20, total: 40, totalPages: 2 });
  });
});
