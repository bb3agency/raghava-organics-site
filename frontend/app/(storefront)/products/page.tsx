import Link from "next/link";
import { Suspense } from "react";
import { Leaf, SlidersHorizontal, ChevronRight } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductGrid";
import { PlpSortSelect } from "@/components/product/PlpSortSelect";
import { StorefrontPagination } from "@/components/product/StorefrontPagination";
import {
  fetchStorefrontProducts,
  type StorefrontProductSort,
} from "@/lib/storefront-products";

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
  title: "Shop Chemical Free & Natural Products",
  description:
    "Browse our full range of chemical free and natural produce, staples, and everyday essentials.",
};

const VALID_SORTS = new Set<StorefrontProductSort>([
  "newest",
  "popularity",
  "price_asc",
  "price_desc",
]);

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const limit = Math.min(48, Math.max(1, Number(params.limit ?? "16") || 16));
  const sort = VALID_SORTS.has(params.sort as StorefrontProductSort)
    ? (params.sort as StorefrontProductSort)
    : "newest";
  const q = params.q ?? "";
  const category = params.category ?? "";

  const { products, meta } = await fetchStorefrontProducts({
    page,
    limit,
    sort,
    search: q || undefined,
    category: category || undefined,
  });

  const title = q
    ? `Results for "${q}"`
    : category
      ? category.replace(/-/g, " ")
      : "Shop All Products";

  const total = meta?.total ?? products.length;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="flex min-h-screen flex-col bg-[#eff5ee] pb-16">
      <section className="relative overflow-hidden bg-[#dbe8d8] py-8 md:py-20">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
          <h1 className="mb-3 font-heading text-2xl font-bold capitalize text-[#23403d] sm:mb-4 sm:text-4xl md:text-5xl">
            {title}
          </h1>
          <nav
            className="flex items-center gap-1.5 text-xs font-bold text-[#767676] sm:gap-2 sm:text-sm"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="transition-colors hover:text-[#ec6e55]">
              Home
            </Link>
            <ChevronRight className="size-3" />
            <span className="capitalize text-[#ec6e55]">
              {q ? "Search" : category ? category.replace(/-/g, " ") : "Shop"}
            </span>
          </nav>
          <p className="mt-3 text-sm font-medium text-[#23403d]/75">
            {total > 0
              ? `${total} active product${total !== 1 ? "s" : ""} in catalog`
              : "Live catalog — products appear here when marked Active in admin"}
          </p>
        </div>
        <div
          className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl"
          aria-hidden
        />
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:pt-12 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-[#e3ebe1] bg-white p-3 shadow-sm sm:mb-8 sm:flex-row sm:items-center sm:gap-4 sm:p-4 lg:p-6">
          <p className="text-sm font-bold text-[#767676]">
            {products.length > 0
              ? `Showing ${products.length} on this page`
              : "No products found"}
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-[#23403d]">
              <SlidersHorizontal className="size-4 text-[#ec6e55]" aria-hidden />
              Sort by
            </span>
            <Suspense
              fallback={
                <div className="h-10 w-40 animate-pulse rounded-full bg-[#efe8e4]" />
              }
            >
              <PlpSortSelect current={sort} />
            </Suspense>
          </div>
        </div>

        {products.length > 0 ? (
          <>
            <ProductGrid products={products} />
            <StorefrontPagination
              page={page}
              totalPages={totalPages}
              basePath="/products"
              searchParams={{ sort, q, category, limit: String(limit) }}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#c5dac2] bg-white px-4 py-24 text-center shadow-sm">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff5ee]">
              <Leaf className="size-10 text-[#ec6e55]" aria-hidden />
            </div>
            <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">
              {q ? "No products matched your search" : "No active products yet"}
            </h2>
            <p className="mb-8 max-w-md text-sm font-medium text-[#767676]">
              {q
                ? "Try checking your spelling or use more general terms."
                : "Add products in the admin console and set their status to Active — they will show up here automatically."}
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
