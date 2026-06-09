import Link from "next/link";
import { notFound } from "next/navigation";
import { Leaf, ShieldCheck, Truck, RotateCcw, Package, ChevronRight } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProduct } from "@/lib/product-adapters";
import { ProductGallery } from "@/components/product/ProductGallery";
import { Rating } from "@/components/shared/Rating";
import { ProductVariantSelector } from "@/components/product/ProductVariantSelector";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import type { Product } from "@/types/product";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  try {
    const payload = await apiClient<unknown>(`/products/${slug}`);
    const product = mapProduct(payload);
    return {
      title: product?.name ?? "Product",
      description: product?.description ?? "",
    };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  let product: Product | null = null;

  try {
    const payload = await apiClient<unknown>(`/products/${slug}`);
    product = mapProduct(payload);
  } catch {
    notFound();
  }

  if (!product) {
    notFound();
  }

  const activeVariant =
    product.variants.find((v) => v.isActive) ?? product.variants[0];

  return (
    <div className="bg-[#eff5ee] min-h-screen pb-16">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:py-8 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#767676] sm:mb-8 sm:gap-2 sm:text-sm" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-[#ec6e55] transition-colors">Home</Link>
          <ChevronRight className="size-3" />
          <Link href="/products" className="hover:text-[#ec6e55] transition-colors">Shop</Link>
          <ChevronRight className="size-3" />
          <Link href={`/categories/${product.category.slug}`} className="hover:text-[#ec6e55] transition-colors">
            {product.category.name}
          </Link>
          <ChevronRight className="size-3" />
          <span className="truncate text-[#ec6e55]">{product.name}</span>
        </nav>

        {/* Main grid */}
        <div className="grid gap-6 rounded-[20px] bg-white p-4 shadow-sm sm:gap-12 sm:p-6 lg:grid-cols-[55%_45%] lg:p-12">
          {/* Gallery */}
          <div className="rounded-[20px] bg-[#faf3ef] p-4 lg:p-8">
            <ProductGallery images={product.images} productName={product.name} />
          </div>

          {/* Info panel */}
          <section className="flex flex-col gap-6">
            {/* Category & Title */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#767676]">
                {product.category.name}
              </p>
              <h1 className="mb-3 font-heading text-xl font-bold leading-tight text-[#23403d] sm:mb-4 sm:text-3xl md:text-4xl">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <Rating rating={product.rating} reviewCount={product.reviewCount} />
                <span className="text-sm font-bold text-[#767676]">({product.reviewCount} reviews)</span>
              </div>
            </div>

            <hr className="border-[#efe8e4]" />

            {/* Description */}
            {product.description ? (
              <p className="text-sm font-medium leading-relaxed text-[#767676]">
                {product.description}
              </p>
            ) : null}

            {/* Stock indicator */}
            <div className="flex items-center gap-2 text-sm font-bold">
              {product.inStock ? (
                <>
                  <span className="inline-block size-2 rounded-full bg-[#00aa63]" aria-hidden />
                  <span className="text-[#00aa63]">In stock, ready to ship</span>
                </>
              ) : (
                <>
                  <span className="inline-block size-2 rounded-full bg-[#ec6e55]" aria-hidden />
                  <span className="text-[#ec6e55]">Out of stock</span>
                </>
              )}
            </div>

            <ProductVariantSelector
              product={product}
              defaultVariant={activeVariant}
            />

            {/* Trust signals */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-[20px] bg-[#faf3ef] p-4 sm:gap-4 sm:p-6">
              {[
                { icon: Leaf, text: "100% Chemical Free" },
                { icon: Truck, text: "Free Delivery" },
                { icon: RotateCcw, text: "Easy Returns" },
                { icon: ShieldCheck, text: "Secure Pay" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 sm:gap-3">
                  <Icon className="size-4 shrink-0 text-[#ec6e55] sm:size-5" aria-hidden />
                  <span className="text-xs font-bold text-[#23403d] sm:text-sm">{text}</span>
                </div>
              ))}
            </div>

            {/* Tags */}
            {product.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#eff5ee] px-3 py-1 text-xs font-bold text-[#767676] transition-colors hover:bg-[#ec6e55] hover:text-white"
                  >
                    <Package className="size-3" aria-hidden />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Reviews Section */}
        <ProductReviewsSection productSlug={product.slug} />
      </div>
    </div>
  );
}
