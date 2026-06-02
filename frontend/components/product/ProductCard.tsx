"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Eye, Heart, ShoppingBag } from "lucide-react";
import type { Product } from "@/types/product";
import { Rating } from "@/components/shared/Rating";
import { PriceDisplay } from "@/components/shared/PriceDisplay";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { useAuthStore } from "@/stores/auth";
import { useWishlistStore } from "@/stores/wishlist";
import { addToWishlist, removeFromWishlist } from "@/lib/wishlist-api";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const image = product.images[0];
  const accessToken = useAuthStore((s) => s.accessToken);
  const items = useWishlistStore((s) => s.items);
  const toggleItem = useWishlistStore((s) => s.toggleItem);
  const [loading, setLoading] = useState(false);

  const inWishlist = items.has(product.id);

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!accessToken) {
      alert("Please sign in to save items to your wishlist.");
      return;
    }
    if (loading) return;

    setLoading(true);
    // Optimistic update
    toggleItem(product.id, !inWishlist);

    try {
      if (inWishlist) {
        await removeFromWishlist(product.id, accessToken);
      } else {
        await addToWishlist(product.id, accessToken);
      }
    } catch {
      // Revert optimistic update on failure
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

  return (
    <article className="group relative flex flex-col rounded-[20px] bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(35,64,61,0.1)]">
      {/* Image Wrap */}
      <div className="relative aspect-square overflow-hidden rounded-t-[20px] p-6">
        <Link href={`/products/${product.slug}`} className="relative block h-full w-full">
          <Image
            src={image?.url ?? "/next.svg"}
            alt={image?.altText ?? product.name}
            fill
            priority={priority}
            className="object-contain transition-transform duration-500 group-hover:scale-110"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </Link>

        {/* Hover Actions (Tasty Daily style overlay buttons) */}
        <div className="absolute right-4 top-4 flex flex-col gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100 lg:translate-x-4 lg:group-hover:translate-x-0">
          <button 
            className={`flex size-9 items-center justify-center rounded-full shadow-sm transition-colors ${
              inWishlist 
                ? "bg-[#ec6e55] text-white" 
                : "bg-white text-[#23403d] hover:bg-[#ec6e55] hover:text-white"
            } ${loading ? "opacity-50" : ""}`}
            aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
            onClick={handleWishlistToggle}
            disabled={loading}
          >
            <Heart className={`size-4 ${inWishlist ? "fill-current" : ""}`} />
          </button>
          <Link 
            href={`/products/${product.slug}`}
            className="flex size-9 items-center justify-center rounded-full bg-white text-[#23403d] shadow-sm transition-colors hover:bg-[#ec6e55] hover:text-white" 
            aria-label="Quick view"
          >
            <Eye className="size-4" />
          </Link>
        </div>

        {/* Badges */}
        <div className="absolute left-4 top-4 flex flex-col gap-1.5">
          {product.isFeatured && (
            <span className="rounded-full bg-[#ec6e55] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
              Hot
            </span>
          )}
          {hasDiscount && discountPct > 0 && (
            <span className="rounded-full bg-[#23403d] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
              -{discountPct}%
            </span>
          )}
        </div>
        
        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-[#23403d] px-4 py-1.5 text-xs font-bold text-white uppercase tracking-wider shadow-md">
              Out of stock
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center p-4 text-center">
        <Link href={`/categories/${product.category.slug}`} className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#767676] hover:text-[#ec6e55]">
          {product.category.name}
        </Link>
        <Link href={`/products/${product.slug}`} className="mb-2">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#23403d] transition-colors hover:text-[#ec6e55]">
            {product.name}
          </h3>
        </Link>

        {product.rating > 0 && (
          <div className="mb-2">
             <Rating rating={product.rating} reviewCount={0} /> {/* Suppress text for cleaner look */}
          </div>
        )}

        <div className="mb-4">
          <PriceDisplay
            pricePaise={activeVariant?.price ?? 0}
            originalPricePaise={
              hasDiscount ? (activeVariant?.compareAtPrice ?? undefined) : undefined
            }
          />
        </div>

        {/* CTA */}
        {product.inStock && activeVariant ? (
          <AddToCartButton
            variantId={activeVariant.id}
            className="mt-auto inline-flex h-10 w-[85%] items-center justify-center gap-2 rounded-full border border-[#efe8e4] bg-white text-sm font-bold text-[#23403d] transition-all hover:border-[#23403d] hover:bg-[#23403d] hover:text-white"
            label="Add to cart"
            icon={<ShoppingBag className="size-4" />}
          />
        ) : (
          <button disabled className="mt-auto inline-flex h-10 w-[85%] items-center justify-center rounded-full bg-[#efe8e4] text-sm font-bold text-[#767676] cursor-not-allowed">
            Unavailable
          </button>
        )}
      </div>
    </article>
  );
}
