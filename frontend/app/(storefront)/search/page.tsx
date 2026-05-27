import Link from "next/link";
import { Search, Leaf, ChevronRight } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchInput } from "@/components/shared/SearchInput";
import type { Product } from "@/types/product";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string; limit?: string }>;
}

export const metadata = {
  title: "Search Products",
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = params.page ?? "1";
  const limit = params.limit ?? "16"; // 4x4 grid

  let products: Product[] = [];
  if (q) {
    try {
      const payload = await apiClient<unknown>(
        `/products?${new URLSearchParams({ search: q, page, limit }).toString()}`,
      );
      products = mapProductListResponse(payload);
    } catch {
      products = [];
    }
  }

  const title = q ? `Results for "${q}"` : "Search Products";

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
            <span className="text-[#ec6e55]">Search</span>
          </nav>
        </div>
        {/* Decorative elements */}
        <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl" aria-hidden />
        <div className="absolute -left-16 top-0 size-48 rounded-full bg-white opacity-40 blur-3xl" aria-hidden />
      </section>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-12 lg:px-8">
        
        {/* Search input container */}
        <div className="mb-10 mx-auto max-w-2xl bg-white p-4 rounded-[20px] shadow-sm">
          <SearchInput defaultValue={q} />
        </div>

        {/* Results */}
        {!q ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] bg-white px-4 py-24 text-center shadow-sm">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff5ee]">
              <Search className="size-10 text-[#ec6e55]" aria-hidden />
            </div>
            <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">
              Start Searching
            </h2>
            <p className="mb-8 text-sm font-medium text-[#767676] max-w-md">
              Type a product name above to find farm-fresh organic products.
            </p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] bg-white px-4 py-24 text-center shadow-sm">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff5ee]">
              <Leaf className="size-10 text-[#ec6e55]" aria-hidden />
            </div>
            <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">
              No results for &ldquo;{q}&rdquo;
            </h2>
            <p className="mb-8 text-sm font-medium text-[#767676] max-w-md">
              Try checking your spelling, use more general terms, or browse our categories.
            </p>
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:bg-[#ec6e55] hover:shadow-lg"
            >
              Browse All Products
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center rounded-[20px] bg-white p-4 lg:p-6 shadow-sm">
              <p className="text-sm font-bold text-[#767676]">
                Found {products.length} product{products.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ProductGrid products={products} />
          </div>
        )}
      </section>
    </div>
  );
}
