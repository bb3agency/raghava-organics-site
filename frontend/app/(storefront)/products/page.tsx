import Link from "next/link";
import { Suspense } from "react";
import { Leaf, SlidersHorizontal, ChevronRight } from "lucide-react";
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
  const VALID_SORTS = new Set(["newest", "popularity", "price_asc", "price_desc"]);
  const page = params.page ?? "1";
  const limit = params.limit ?? "16";
  const sort = VALID_SORTS.has(params.sort ?? "") ? (params.sort as string) : "newest";
  const q = params.q ?? "";
  const category = params.category ?? "";
  const query = new URLSearchParams({ page, limit, sort, ...(q && { search: q }), ...(category && { category }) }).toString();

  let products: Product[] = [];
  try {
    const payload = await apiClient<unknown>(`/products?${query}`);
    products = mapProductListResponse(payload);
  } catch {
    products = [];
  }

  const title = q ? `Results for "${q}"` : category ? category.replace('-', ' ') : "Shop All Products";

  return (
    <div className="flex flex-col bg-[#eff5ee] min-h-screen pb-16">
      {/* ── Page Header Banner ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#dbe8d8] py-12 md:py-20">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
          <h1 className="mb-4 font-heading text-4xl font-bold capitalize text-[#23403d] md:text-5xl">
            {title}
          </h1>
          <nav className="flex items-center gap-2 text-sm font-bold text-[#767676]" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#ec6e55] transition-colors">Home</Link>
            <ChevronRight className="size-3" />
            <span className="text-[#ec6e55] capitalize">{q ? 'Search' : category ? category.replace('-', ' ') : 'Shop'}</span>
          </nav>
        </div>
        {/* Decorative elements */}
        <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl" aria-hidden />
        <div className="absolute -left-16 top-0 size-48 rounded-full bg-white opacity-40 blur-3xl" aria-hidden />
      </section>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-12 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-[20px] bg-white p-4 shadow-sm sm:flex-row sm:items-center lg:p-6">
          <p className="text-sm font-bold text-[#767676]">
            {products.length > 0
              ? `Showing ${products.length} product${products.length !== 1 ? "s" : ""}`
              : "No products found"}
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-[#23403d]">
              <SlidersHorizontal className="size-4 text-[#ec6e55]" aria-hidden />
              Sort by
            </span>
            <Suspense fallback={<div className="h-10 w-40 animate-pulse rounded-full bg-[#efe8e4]" />}>
              <PlpSortSelect current={sort} />
            </Suspense>
          </div>
        </div>

        {/* Product grid or empty state */}
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[20px] bg-white px-4 py-24 text-center shadow-sm">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff5ee]">
              <Leaf className="size-10 text-[#ec6e55]" aria-hidden />
            </div>
            <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">
              {q ? "No products matched your search" : "No products yet"}
            </h2>
            <p className="mb-8 text-sm font-medium text-[#767676] max-w-md">
              {q ? "Try checking your spelling or use more general terms." : "We're currently stocking up on fresh items. Please check back soon!"}
            </p>
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg"
            >
              Browse All Products
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
