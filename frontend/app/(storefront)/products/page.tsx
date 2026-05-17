import { apiClient } from "@/lib/api";
import { ProductGrid } from "@/components/product/ProductGrid";
import { mapProductListResponse } from "@/lib/product-adapters";
import type { Product } from "@/types/product";

interface ProductsPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    sort?: string;
    q?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = params.page ?? "1";
  const limit = params.limit ?? "12";
  const sort = params.sort ?? "newest";
  const q = params.q ?? "";
  const query = new URLSearchParams({ page, limit, sort, q }).toString();

  let products: Product[] = [];
  try {
    const payload = await apiClient<unknown>(`/products?${query}`);
    products = mapProductListResponse(payload);
  } catch {
    products = [];
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold">Products</h1>
        <p className="text-sm text-muted-foreground">
          Showing {products.length} products
        </p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
