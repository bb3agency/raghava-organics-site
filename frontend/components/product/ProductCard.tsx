"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Heart, ShoppingCart, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { useAuthStore } from "@/stores/auth";
import { useWishlistStore } from "@/stores/wishlist";
import { addToWishlist, removeFromWishlist } from "@/lib/wishlist-api";
import { cn } from "@/lib/utils";
import { useStoreConfig } from "@/components/providers/StoreConfigProvider";
import { formatPrice } from "@/lib/format-price";

const PLACEHOLDER_IMAGE = "/images/product-placeholder.svg";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
  className?: string;
}

export function ProductCard({
  product,
  priority = false,
  className,
}: ProductCardProps) {
  const image = product.images[0];
  const accessToken = useAuthStore((s) => s.accessToken);
  const { wishlistEnabled } = useStoreConfig();
  const items = useWishlistStore((s) => s.items);
  const toggleItem = useWishlistStore((s) => s.toggleItem);
  const [loading, setLoading] = useState(false);

  const inWishlist = items.has(product.id);

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!accessToken) {
      alert("Please sign in to save items to your wishlist.");
      return;
    }
    if (loading) return;
    setLoading(true);
    toggleItem(product.id, !inWishlist);
    try {
      if (inWishlist) {
        await removeFromWishlist(product.id, accessToken);
      } else {
        await addToWishlist(product.id, accessToken);
      }
    } catch {
      toggleItem(product.id, inWishlist);
      alert("Failed to update wishlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const activeVariant =
    product.variants.find((v) => v.isActive) ?? product.variants[0];
  const hasDiscount =
    typeof activeVariant?.compareAtPrice === "number" &&
    activeVariant.compareAtPrice > activeVariant.price;
  const discountPct =
    hasDiscount && activeVariant?.compareAtPrice
      ? Math.round((1 - activeVariant.price / activeVariant.compareAtPrice) * 100)
      : 0;

  const imageSrc = image?.url && image.url !== "/next.svg" ? image.url : PLACEHOLDER_IMAGE;
  const shortDescription = product.description.trim().slice(0, 80);

  // Show up to 4 variant name chips (e.g. "500g", "1kg")
  const variantLabels = product.variants
    .filter((v) => v.isActive && v.name)
    .slice(0, 4)
    .map((v) => v.name);
  const showVariants = variantLabels.length > 1;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e8ede7] bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      {/* Image */}
      <div className="relative">
        <Link
          href={`/products/${product.slug}`}
          className="relative block aspect-square overflow-hidden bg-[#fafafa]"
        >
          <Image
            src={imageSrc}
            alt={image?.altText ?? product.name}
            fill
            priority={priority}
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </Link>

        {/* Badges top-left */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
          {product.isFeatured ? (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-[#ec6e55] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              <Sparkles className="size-2.5" aria-hidden />
              Featured
            </span>
          ) : null}
          {hasDiscount && discountPct > 0 ? (
            <span className="rounded-sm bg-[#d94f3a] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              -{discountPct}%
            </span>
          ) : null}
          {!product.inStock ? (
            <span className="rounded-sm bg-[#d94f3a] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              Out of stock
            </span>
          ) : null}
        </div>

        {/* Wishlist button top-right */}
        {wishlistEnabled ? (
          <button
            type="button"
            className={cn(
              "absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full border border-[#e8ede7] bg-white/95 text-[#23403d] shadow-sm transition-colors hover:bg-[#ec6e55] hover:text-white",
              inWishlist && "bg-[#ec6e55] text-white",
              loading && "opacity-60",
            )}
            aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
            onClick={handleWishlistToggle}
            disabled={loading}
          >
            <Heart className={cn("size-3.5", inWishlist && "fill-current")} />
          </button>
        ) : null}
      </div>

      {/* Stock status bar */}
      <div className="h-1 w-full bg-[#f0f0f0]" aria-hidden>
        {product.inStock && (
          <div className="h-full w-full bg-[#ec6e55]" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5">
        <Link href={`/products/${product.slug}`} className="mb-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#1a2e2c] transition-colors group-hover:text-[#ec6e55]">
            {product.name}
          </h3>
        </Link>

        {shortDescription ? (
          <p className="mb-2.5 line-clamp-2 text-[11px] leading-relaxed text-[#888]">
            {shortDescription}
            {product.description.length > 80 ? "…" : ""}
          </p>
        ) : (
          <div className="mb-2.5 min-h-[1.5rem]" />
        )}

        {/* Variant chips */}
        {showVariants ? (
          <div className="mb-2.5 flex flex-wrap gap-1">
            {variantLabels.map((label) => (
              <span
                key={label}
                className="rounded border border-[#e8ede7] px-1.5 py-0.5 text-[10px] font-semibold text-[#555]"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {/* Bottom row: category + price + cart */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            {product.category.name ? (
              <Link
                href={`/categories/${product.category.slug}`}
                className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[#999] transition-colors hover:text-[#ec6e55]"
              >
                {product.category.name}
              </Link>
            ) : null}
            <div className="flex items-baseline gap-1.5">
              {hasDiscount && activeVariant?.compareAtPrice ? (
                <span className="text-[11px] text-[#aaa] line-through">
                  {formatPrice(activeVariant.compareAtPrice)}
                </span>
              ) : null}
              <span className="text-sm font-extrabold text-[#ec6e55]">
                {formatPrice(activeVariant?.price ?? 0)}
              </span>
            </div>
          </div>

          {product.inStock && activeVariant ? (
            <AddToCartButton
              variantId={activeVariant.id}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#e8ede7] bg-white text-[#23403d] shadow-sm transition-all hover:border-[#ec6e55] hover:bg-[#ec6e55] hover:text-white"
              label=""
              icon={<ShoppingCart className="size-4" />}
            />
          ) : (
            <Link
              href={`/products/${product.slug}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#e8ede7] bg-[#f7fbf6] text-[#23403d] transition-colors hover:border-[#23403d]"
              aria-label={`View ${product.name}`}
            >
              <ShoppingCart className="size-4 opacity-40" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
