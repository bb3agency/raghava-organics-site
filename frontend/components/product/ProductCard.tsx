"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Eye, Heart, Leaf, ShoppingBag, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { PriceDisplay } from "@/components/shared/PriceDisplay";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { useAuthStore } from "@/stores/auth";
import { useWishlistStore } from "@/stores/wishlist";
import { addToWishlist, removeFromWishlist } from "@/lib/wishlist-api";
import { cn } from "@/lib/utils";
import { useStoreConfig } from "@/components/providers/StoreConfigProvider";

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

  const imageSrc = image?.url && image.url !== "/next.svg" ? image.url : PLACEHOLDER_IMAGE;
  const shortDescription = product.description.trim().slice(0, 72);

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e3ebe1] bg-white shadow-[0_8px_30px_-20px_rgba(35,64,61,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-[#c5dac2] hover:shadow-[0_18px_40px_-18px_rgba(35,64,61,0.22)]",
        className,
      )}
    >
      <div className="relative">
        <Link
          href={`/products/${product.slug}`}
          className="relative block aspect-[4/5] overflow-hidden bg-gradient-to-b from-[#f4faf2] via-[#eff5ee] to-[#e8f0e6]"
        >
          <Image
            src={imageSrc}
            alt={image?.altText ?? product.name}
            fill
            priority={priority}
            className="object-contain p-5 transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/90 to-transparent" />
        </Link>

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.isFeatured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ec6e55] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              <Sparkles className="size-3" aria-hidden />
              Featured
            </span>
          ) : null}
          {hasDiscount && discountPct > 0 ? (
            <span className="rounded-full bg-[#23403d] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              -{discountPct}%
            </span>
          ) : null}
          {!product.inStock ? (
            <span className="rounded-full bg-[#767676] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              Out of stock
            </span>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-100 transition-all duration-300 lg:translate-x-2 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100">
          {wishlistEnabled ? (
            <button
              type="button"
              className={cn(
                "flex size-9 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#23403d] shadow-md backdrop-blur-sm transition-colors hover:bg-[#ec6e55] hover:text-white",
                inWishlist && "bg-[#ec6e55] text-white",
                loading && "opacity-60",
              )}
              aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
              onClick={handleWishlistToggle}
              disabled={loading}
            >
              <Heart className={cn("size-4", inWishlist && "fill-current")} />
            </button>
          ) : null}
          <Link
            href={`/products/${product.slug}`}
            className="flex size-9 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#23403d] shadow-md backdrop-blur-sm transition-colors hover:bg-[#23403d] hover:text-white"
            aria-label={`View ${product.name}`}
          >
            <Eye className="size-4" />
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        {product.category.slug ? (
          <Link
            href={`/categories/${product.category.slug}`}
            className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#767676] transition-colors hover:text-[#ec6e55]"
          >
            <Leaf className="size-3" aria-hidden />
            {product.category.name}
          </Link>
        ) : null}

        <Link href={`/products/${product.slug}`} className="mb-1.5">
          <h3 className="line-clamp-2 min-h-[2.5rem] font-heading text-sm font-bold leading-snug text-[#23403d] transition-colors group-hover:text-[#ec6e55] sm:text-base">
            {product.name}
          </h3>
        </Link>

        {shortDescription ? (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[#767676]">
            {shortDescription}
            {product.description.length > 72 ? "…" : ""}
          </p>
        ) : (
          <div className="mb-3 min-h-[2rem]" />
        )}

        <div className="mb-4 mt-auto">
          <PriceDisplay
            pricePaise={activeVariant?.price ?? 0}
            originalPricePaise={
              hasDiscount ? (activeVariant?.compareAtPrice ?? undefined) : undefined
            }
          />
        </div>

        {product.inStock && activeVariant ? (
          <AddToCartButton
            variantId={activeVariant.id}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#23403d] text-sm font-bold text-white transition-all hover:bg-[#ec6e55] hover:shadow-md"
            label="Add to cart"
            icon={<ShoppingBag className="size-4" />}
          />
        ) : (
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#dbe8d8] bg-[#f7fbf6] text-sm font-bold text-[#23403d] transition-colors hover:border-[#23403d]"
          >
            View product
          </Link>
        )}
      </div>
    </article>
  );
}
