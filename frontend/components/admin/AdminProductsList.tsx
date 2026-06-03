"use client";

import Link from "next/link";
import { useCallback } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useAdminListResource } from "@/hooks/use-admin-list-resource";
import {
  buildAdminQuery,
  ensureArray,
  readPaginatedItems,
  type AdminProductListItem,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";

const PAGE_SIZE = 20;

export function AdminProductsList() {
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.productsWrite);

  const fetchPage = useCallback(
    async (page: number) =>
      api<PaginatedResponse<AdminProductListItem>>(
        `/admin/products${buildAdminQuery({ page, limit: PAGE_SIZE })}`,
      ),
    [api],
  );

  const { data, loading, error, setPage } =
    useAdminListResource<AdminProductListItem>(fetchPage);

  const items = readPaginatedItems(data);

  return (
    <AdminSection
      title="Products"
      description="Catalog products and variants."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No products found."
      actions={
        canWrite ? (
          <Link
            href="/admin/products/new"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            New product
          </Link>
        ) : null
      }
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Variants</th>
                  <th className="px-3 py-2 font-medium">From price</th>
                  <th className="px-3 py-2 font-medium">Featured</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  const variants = ensureArray<AdminProductListItem["variants"][number]>(
                    product.variants,
                  );
                  const activeVariants = variants.filter((v) => v.isActive);
                  const minPrice = activeVariants.length
                    ? Math.min(...activeVariants.map((v) => v.price))
                    : null;
                  return (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="font-medium hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{product.slug}</p>
                      </td>
                      <td className="px-3 py-2">{product.category.name}</td>
                      <td className="px-3 py-2">{variants.length}</td>
                      <td className="px-3 py-2">
                        {minPrice !== null ? formatPaise(minPrice) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <AdminStatusBadge
                          label={product.isFeatured ? "Featured" : "Standard"}
                          tone={product.isFeatured ? "success" : "default"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination meta={data.meta} onPageChange={setPage} />
        </>
      ) : null}
    </AdminSection>
  );
}
