import { Star } from "lucide-react";

interface RatingProps {
  rating: number;
  reviewCount: number;
}

export function Rating({ rating, reviewCount }: RatingProps) {
  const rounded = Math.round(Math.max(0, Math.min(5, rating)));

  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-0.5" aria-label={`Rated ${rounded} out of 5`}>
        {Array.from({ length: 5 }).map((_, idx) => (
          <Star
            key={idx}
            className={`size-3.5 ${idx < rounded ? "fill-current text-amber-500" : ""}`}
            aria-hidden
          />
        ))}
      </div>
      <span>({reviewCount})</span>
    </div>
  );
}
