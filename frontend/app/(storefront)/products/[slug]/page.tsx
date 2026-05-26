import Link from "next/link";
import { notFound } from "next/navigation";
import { Leaf, ShieldCheck, Truck, RotateCcw, Package } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProduct } from "@/lib/product-adapters";
import { ProductGallery } from "@/components/product/ProductGallery";
import { PriceDisplay } from "@/components/shared/PriceDisplay";
import { Rating } from "@/components/shared/Rating";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
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
  const hasDiscount =
    typeof activeVariant?.compareAtPrice === "number" &&
    activeVariant.compareAtPrice > activeVariant.price;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-primary">Shop</Link>
        <span>/</span>
        <Link href={`/categories/${product.category.slug}`} className="hover:text-primary">
          {product.category.name}
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-foreground">{product.name}</span>
      </nav>

      {/* Main grid */}
      <div className="grid gap-10 lg:grid-cols-[55%_45%]">
        {/* Gallery */}
        <ProductGallery images={product.images} productName={product.name} />

        {/* Info panel */}
        <section className="flex flex-col gap-5">
          {/* Category */}
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            {product.category.name}
          </p>

          {/* Title */}
          <h1 className="font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {product.name}
          </h1>

          {/* Rating */}
          <Rating rating={product.rating} reviewCount={product.reviewCount} />

          {/* Price */}
          <div className="flex items-center gap-3">
            <PriceDisplay
              pricePaise={activeVariant?.price ?? 0}
              originalPricePaise={hasDiscount ? (activeVariant?.compareAtPrice ?? undefined) : undefined}
            />
            {hasDiscount && activeVariant?.compareAtPrice && (
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                Save {Math.round((1 - activeVariant.price / activeVariant.compareAtPrice) * 100)}%
              </span>
            )}
          </div>

          {/* Description */}
          {product.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          {/* Stock indicator */}
          <div className="flex items-center gap-1.5 text-sm">
            {product.inStock ? (
              <>
                <span className="inline-block size-2 rounded-full bg-green-500" aria-hidden />
                <span className="font-medium text-green-700">In stock, ready to ship</span>
              </>
            ) : (
              <>
                <span className="inline-block size-2 rounded-full bg-muted-foreground/40" aria-hidden />
                <span className="text-muted-foreground">Out of stock</span>
              </>
            )}
          </div>

          {/* Variants (if multiple) */}
          {product.variants.length > 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pack size
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <span
                    key={v.id}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      v.id === activeVariant?.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:border-primary"
                    }`}
                  >
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTAs */}
          {product.inStock && activeVariant ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <AddToCartButton
                variantId={activeVariant.id}
                className="flex h-12 flex-1 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                label="Add to cart"
              />
              <AddToCartButton
                variantId={activeVariant.id}
                className="flex h-12 flex-1 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground transition-colors hover:bg-accent/90"
                label="Buy now"
                redirectTo="/checkout"
              />
            </div>
          ) : (
            <p className="rounded-full border border-border px-4 py-3 text-center text-sm font-medium text-muted-foreground">
              Currently out of stock
            </p>
          )}

          {/* Trust signals */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-secondary/40 p-4">
            {[
              { icon: Leaf, text: "100% Organic & Certified" },
              { icon: Truck, text: "Free delivery above ₹499" },
              { icon: RotateCcw, text: "7-day hassle-free returns" },
              { icon: ShieldCheck, text: "Secure checkout" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-xs text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  <Package className="size-3" aria-hidden />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
