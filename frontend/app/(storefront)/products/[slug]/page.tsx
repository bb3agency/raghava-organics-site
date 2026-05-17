import { notFound } from "next/navigation";
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

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[55%_45%]">
      <ProductGallery images={product.images} productName={product.name} />
      <section className="grid gap-4">
        {(() => {
          const activeVariant =
            product.variants.find((variant) => variant.isActive) ??
            product.variants[0];
          return (
            <>
        <h1 className="font-heading text-3xl font-semibold">{product.name}</h1>
        <Rating rating={product.rating} reviewCount={product.reviewCount} />
              <PriceDisplay
                pricePaise={activeVariant?.price ?? 0}
                originalPricePaise={activeVariant?.compareAtPrice ?? undefined}
              />
              <p className="text-sm text-muted-foreground">
                Category: {product.category.name}
              </p>
        <div className="grid gap-3 rounded-lg border border-border p-4">
                {activeVariant ? (
                  <>
                    <AddToCartButton
                      variantId={activeVariant.id}
                      className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground"
                      label="Add to cart"
                    />
                    <AddToCartButton
                      variantId={activeVariant.id}
                      className="h-11 rounded-md border border-border text-sm font-medium"
                      label="Buy now"
                      redirectTo="/checkout"
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No active variants.</p>
                )}
        </div>
            </>
          );
        })()}
      </section>
    </div>
  );
}
