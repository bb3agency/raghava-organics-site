import Link from "next/link";
import { Search, Leaf } from "lucide-react";
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
  const limit = params.limit ?? "12";

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Header */}
      <div className="mb-8">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <span className="font-medium text-foreground">Search</span>
        </nav>
        <h1 className="font-heading text-3xl font-bold text-foreground">
          {q ? `Results for "${q}"` : "Search Products"}
        </h1>
        {q && (
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length > 0
              ? `Found ${products.length} product${products.length !== 1 ? "s" : ""}`
              : "No results found"}
          </p>
        )}
      </div>

      {/* Search input */}
      <div className="mb-8 max-w-lg">
        <SearchInput defaultValue={q} />
      </div>

      {/* Results */}
      {!q ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <Search className="size-14 opacity-20" aria-hidden />
          <p className="font-heading text-xl font-semibold text-foreground">Start searching</p>
          <p className="text-sm">Type a product name above to find organic products.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <Leaf className="size-14 opacity-20" aria-hidden />
          <p className="font-heading text-xl font-semibold text-foreground">No results for &ldquo;{q}&rdquo;</p>
          <p className="text-sm">Try a different keyword or browse all products.</p>
          <Link
            href="/products"
            className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
