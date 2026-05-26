import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { Rating } from "@/components/shared/Rating";
import { PriceDisplay } from "@/components/shared/PriceDisplay";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const image = product.images[0];
  const activeVariant =
    product.variants.find((variant) => variant.isActive) ?? product.variants[0];
  const hasDiscount =
    typeof activeVariant?.compareAtPrice === "number" &&
    activeVariant.compareAtPrice > activeVariant.price;
  const discountPct =
    hasDiscount && activeVariant?.compareAtPrice
      ? Math.round(
          (1 - activeVariant.price / activeVariant.compareAtPrice) * 100,
        )
      : 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow duration-300 hover:shadow-md">
      {/* Image */}
      <Link href={`/products/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-secondary">
        <Image
          src={image?.url ?? "/next.svg"}
          alt={image?.altText ?? product.name}
          fill
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.isFeatured && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Featured
            </span>
          )}
          {hasDiscount && discountPct > 0 && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
              -{discountPct}%
            </span>
          )}
        </div>
        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              Out of stock
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {product.category.name}
        </p>
        <Link href={`/products/${product.slug}`}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors hover:text-primary">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center justify-between gap-2">
          <PriceDisplay
            pricePaise={activeVariant?.price ?? 0}
            originalPricePaise={
              hasDiscount ? (activeVariant?.compareAtPrice ?? undefined) : undefined
            }
          />
          <Rating rating={product.rating} reviewCount={product.reviewCount} />
        </div>

        {/* CTA */}
        {product.inStock && activeVariant ? (
          <AddToCartButton
            variantId={activeVariant.id}
            className="mt-auto inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
            label="Add to cart"
          />
        ) : (
          <p className="mt-auto text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>
    </article>
  );
}
