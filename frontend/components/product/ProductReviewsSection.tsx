"use client";

import { useEffect, useState } from "react";
import { getProductReviews, type Review } from "@/lib/reviews-api";
import { Rating } from "@/components/shared/Rating";

interface ProductReviewsSectionProps {
  productSlug: string;
}

export function ProductReviewsSection({ productSlug }: ProductReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await getProductReviews(productSlug, { limit: 5 });
        if (!cancelled) {
          setReviews(Array.isArray(result.items) ? result.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load reviews.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-[#767676]">Loading reviews...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-[#ec6e55]">{error}</div>;
  }

  if (reviews.length === 0) {
    return null; // Or show empty state
  }

  return (
    <section className="mt-16 border-t border-[#efe8e4] pt-12">
      <h2 className="mb-8 font-heading text-2xl font-bold text-[#23403d]">Customer Reviews</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-[#efe8e4] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-[#23403d]">
                  {review.author.firstName} {review.author.lastName}
                </p>
                <p className="text-xs font-medium text-[#767676]">
                  {new Date(review.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Rating rating={review.rating} />
            </div>
            {review.body && (
              <p className="text-sm font-medium leading-relaxed text-[#4a4a4a]">
                {review.body}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
