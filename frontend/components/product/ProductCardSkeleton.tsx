import { Skeleton } from "@/components/ui/skeleton";

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-[20px] bg-white shadow-sm">
      {/* Image Skeleton */}
      <div className="relative aspect-square overflow-hidden rounded-t-[20px] p-6">
        <Skeleton className="h-full w-full rounded-[10px]" />
      </div>
      
      {/* Content Skeleton */}
      <div className="flex flex-1 flex-col items-center p-4 text-center">
        {/* Category */}
        <Skeleton className="mb-2 h-3 w-16" />
        
        {/* Title */}
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-3 h-4 w-1/2" />
        
        {/* Rating */}
        <div className="mb-3 flex items-center justify-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="size-3 rounded-full" />
          ))}
        </div>
        
        {/* Price */}
        <Skeleton className="mb-4 h-5 w-20" />
        
        {/* Button */}
        <Skeleton className="mt-auto h-10 w-[85%] rounded-full" />
      </div>
    </div>
  );
}
