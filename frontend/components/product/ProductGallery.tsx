"use client";

import { useState } from "react";
import Image from "next/image";

interface ProductGalleryProps {
  images: Array<{ url: string; altText: string }>;
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary">
        <Image
          src={current?.url ?? "/next.svg"}
          alt={current?.altText ?? productName}
          fill
          priority
          className="object-cover transition-opacity duration-200"
          sizes="(max-width: 768px) 100vw, 55vw"
        />
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.slice(0, 6).map((img, idx) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(idx)}
              className={`relative size-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                idx === active
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border opacity-70 hover:opacity-100"
              }`}
              aria-label={`View image ${idx + 1}`}
            >
              <Image
                src={img.url}
                alt={img.altText}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
