import { Skeleton } from "@/components/ui/skeleton";

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#e8ede7] bg-white shadow-sm">
      {/* Image */}
      <div className="aspect-square w-full bg-[#fafafa]">
        <Skeleton className="h-full w-full rounded-none" />
      </div>

      {/* Stock bar placeholder */}
      <div className="h-1 w-full bg-[#f0f0f0]" />

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5">
        <Skeleton className="mb-1.5 h-4 w-4/5" />
        <Skeleton className="mb-1 h-3 w-full" />
        <Skeleton className="mb-2.5 h-3 w-2/3" />

        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            <Skeleton className="mb-1 h-2.5 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="size-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
