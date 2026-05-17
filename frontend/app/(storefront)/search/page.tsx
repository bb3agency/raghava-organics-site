import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductGrid } from "@/components/product/ProductGrid";
import type { Product } from "@/types/product";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string; limit?: string }>;
}

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
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold">Search</h1>
      <p className="text-sm text-muted-foreground">
        Query: {q || "—"} · Results: {products.length}
      </p>
      <ProductGrid products={products} />
    </div>
  );
}
