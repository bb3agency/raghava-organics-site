import { formatPrice } from "@/lib/format-price";

interface PriceDisplayProps {
  pricePaise: number;
  originalPricePaise?: number;
}

export function PriceDisplay({
  pricePaise,
  originalPricePaise,
}: PriceDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      {typeof originalPricePaise === "number" &&
      originalPricePaise > pricePaise ? (
        <span className="text-sm text-muted-foreground line-through">
          {formatPrice(originalPricePaise)}
        </span>
      ) : null}
      <span className="text-base font-semibold">{formatPrice(pricePaise)}</span>
    </div>
  );
}
