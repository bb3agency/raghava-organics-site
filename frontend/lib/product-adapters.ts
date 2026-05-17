import type { Product } from "@/types/product";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function mapProduct(raw: unknown): Product {
  const item = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};

  const imagesRaw = Array.isArray(item.images) ? item.images : [];
  const images = imagesRaw.map((image) => {
    const img = image as Record<string, unknown>;
    return {
      id: toStringValue(img.id, ""),
      url: toStringValue(img.url, "/next.svg"),
      altText: toStringValue(
        img.altText,
        toStringValue(item.name, "Product image"),
      ),
      sortOrder: toNumber(img.sortOrder, 0),
    };
  });

  const categoryRaw =
    item.category && typeof item.category === "object"
      ? (item.category as Record<string, unknown>)
      : null;

  const variantsRaw = Array.isArray(item.variants) ? item.variants : [];
  const variants = variantsRaw.map((variant) => {
    const obj = variant as Record<string, unknown>;
    return {
      id: toStringValue(obj.id),
      name: toStringValue(obj.name),
      sku: toStringValue(obj.sku),
      price: toNumber(obj.price, 0),
      compareAtPrice:
        typeof obj.compareAtPrice === "number" ? obj.compareAtPrice : null,
      isActive: Boolean(obj.isActive ?? true),
    };
  });

  const firstActiveVariant = variants.find((v) => v.isActive) ?? variants[0];

  return {
    id: toStringValue(item.id, "unknown-id"),
    name: toStringValue(item.name, "Untitled product"),
    slug: toStringValue(item.slug, toStringValue(item.id, "product")),
    description: toStringValue(item.description),
    category: {
      id: toStringValue(categoryRaw?.id, ""),
      name: toStringValue(categoryRaw?.name, "General"),
      slug: toStringValue(categoryRaw?.slug, ""),
    },
    rating: toNumber(item.rating, 0),
    reviewCount: toNumber(item.reviewCount, 0),
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    isFeatured: Boolean(item.isFeatured ?? false),
    images,
    variants,
    inStock:
      typeof item.inStock === "boolean"
        ? item.inStock
        : Boolean(firstActiveVariant && firstActiveVariant.price >= 0),
  };
}

export function mapProductListResponse(payload: unknown): Product[] {
  if (Array.isArray(payload)) {
    return payload.map(mapProduct);
  }

  if (payload && typeof payload === "object") {
    const obj = payload as { items?: unknown[] };
    if (Array.isArray(obj.items)) {
      return obj.items.map(mapProduct);
    }
  }

  return [];
}
