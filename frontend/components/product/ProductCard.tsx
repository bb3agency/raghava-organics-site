import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { Rating } from "@/components/shared/Rating";
import { PriceDisplay } from "@/components/shared/PriceDisplay";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0];
  const activeVariant =
    product.variants.find((variant) => variant.isActive) ?? product.variants[0];
  const hasDiscount =
    typeof activeVariant?.compareAtPrice === "number" &&
    activeVariant.compareAtPrice > activeVariant.price;

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden">
          <Image
            src={image?.url ?? "/next.svg"}
            alt={image?.altText ?? product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />
          {hasDiscount ? (
            <span className="absolute left-2 top-2 rounded bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
              SALE
            </span>
          ) : null}
        </div>
      </Link>

      <div className="grid gap-2 p-3">
        <h3 className="line-clamp-1 text-sm font-medium">{product.name}</h3>
        <p className="text-xs text-muted-foreground">{product.category.name}</p>
        <PriceDisplay
          pricePaise={activeVariant?.price ?? 0}
          originalPricePaise={hasDiscount ? activeVariant?.compareAtPrice ?? undefined : undefined}
        />
        <Rating rating={product.rating} reviewCount={product.reviewCount} />
        {activeVariant ? (
          <AddToCartButton
            variantId={activeVariant.id}
            className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground"
            label="Add to cart"
          />
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>
    </article>
  );
}
