import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductGrid } from "@/components/product/ProductGrid";
import type { Product } from "@/types/product";

interface CategoryProductsPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function CategoryProductsPage({
  params,
  searchParams,
}: CategoryProductsPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const page = query.page ?? "1";
  const limit = query.limit ?? "12";

  let products: Product[] = [];
  try {
    const payload = await apiClient<unknown>(
      `/products/categories/${slug}/products?${new URLSearchParams({
        page,
        limit,
      }).toString()}`,
    );
    products = mapProductListResponse(payload);
  } catch {
    products = [];
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold">Category: {slug}</h1>
      <p className="text-sm text-muted-foreground">Results: {products.length}</p>
      <ProductGrid products={products} />
    </div>
  );
}
