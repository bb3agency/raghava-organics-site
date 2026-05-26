import Link from "next/link";
import { Suspense } from "react";
import { Leaf, SlidersHorizontal } from "lucide-react";
import { apiClient } from "@/lib/api";
import { ProductGrid } from "@/components/product/ProductGrid";
import { PlpSortSelect } from "@/components/product/PlpSortSelect";
import { mapProductListResponse } from "@/lib/product-adapters";
import type { Product } from "@/types/product";

interface ProductsPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    sort?: string;
    q?: string;
    category?: string;
  }>;
}

export const metadata = {
  title: "Shop Organic Products",
  description: "Browse our full range of certified organic produce, staples, and everyday essentials.",
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = params.page ?? "1";
  const limit = params.limit ?? "12";
  const sort = params.sort ?? "newest";
  const q = params.q ?? "";
  const category = params.category ?? "";
  const query = new URLSearchParams({ page, limit, sort, ...(q && { q }), ...(category && { category }) }).toString();

  let products: Product[] = [];
  try {
    const payload = await apiClient<unknown>(`/products?${query}`);
    products = mapProductListResponse(payload);
  } catch {
    products = [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Page header */}
      <div className="mb-8">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Shop</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {q ? `Results for "${q}"` : category ? `${category}` : "All Products"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {products.length > 0
                ? `Showing ${products.length} organic product${products.length !== 1 ? "s" : ""}`
                : "No products found"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Sort by
            </span>
            <Suspense fallback={null}>
              <PlpSortSelect current={sort} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Product grid or empty state */}
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <div className="flex flex-col items-center gap-4 py-24 text-center text-muted-foreground">
          <Leaf className="size-14 opacity-25" aria-hidden />
          <p className="font-heading text-xl font-semibold text-foreground">
            {q ? "No products matched your search" : "No products yet"}
          </p>
          <p className="text-sm">
            {q ? "Try a different search term or browse all products." : "We're stocking up. Check back soon!"}
          </p>
          <Link
            href="/products"
            className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
          >
            Browse all products
          </Link>
        </div>
      )}
    </div>
  );
}
