import Link from "next/link";
import { Leaf } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductGrid } from "@/components/product/ProductGrid";
import type { Product } from "@/types/product";

interface CategoryProductsPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; limit?: string; sort?: string }>;
}

function formatCategoryName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: CategoryProductsPageProps) {
  const { slug } = await params;
  const name = formatCategoryName(slug);
  return { title: `${name} — Organic Products` };
}

export default async function CategoryProductsPage({
  params,
  searchParams,
}: CategoryProductsPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const page = query.page ?? "1";
  const limit = query.limit ?? "12";
  const sort = query.sort ?? "newest";
  const categoryName = formatCategoryName(slug);

  let products: Product[] = [];
  try {
    const payload = await apiClient<unknown>(
      `/products/categories/${slug}/products?${new URLSearchParams({ page, limit, sort }).toString()}`,
    );
    products = mapProductListResponse(payload);
  } catch {
    products = [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-primary">Shop</Link>
        <span>/</span>
        <span className="font-medium text-foreground">{categoryName}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Organic Category
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold text-foreground">
            {categoryName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length > 0
              ? `${products.length} product${products.length !== 1 ? "s" : ""} available`
              : "No products yet"}
          </p>
        </div>
        <Link
          href="/products"
          className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          ← All products
        </Link>
      </div>

      {/* Grid */}
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <div className="flex flex-col items-center gap-4 py-24 text-center text-muted-foreground">
          <Leaf className="size-14 opacity-20" aria-hidden />
          <p className="font-heading text-xl font-semibold text-foreground">Coming soon</p>
          <p className="text-sm">We&apos;re adding products to this category. Check back shortly!</p>
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
