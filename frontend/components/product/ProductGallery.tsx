import Image from "next/image";

interface ProductGalleryProps {
  images: Array<{ url: string; altText: string }>;
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const primary = images[0];

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border">
        <Image
          src={primary?.url ?? "/next.svg"}
          alt={primary?.altText ?? productName}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 55vw"
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {images.slice(0, 4).map((image) => (
          <div
            key={image.url}
            className="relative aspect-square overflow-hidden rounded border border-border"
          >
            <Image
              src={image.url}
              alt={image.altText}
              fill
              className="object-cover"
              sizes="20vw"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
