import { apiClient } from "./api";
import type { ProductCategory } from "@/types/product";

export interface CategoryWithMeta extends ProductCategory {
  image: string;
  color: string;
}

const CATEGORY_META_FALLBACKS: Record<string, { image: string; color: string }> = {
  "fresh-vegetables": {
    image: "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=160&h=160&fit=crop",
    color: "bg-[#e8f5e9]",
  },
  "fruits": {
    image: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=160&h=160&fit=crop",
    color: "bg-[#ffebee]",
  },
  "spices-condiments": {
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=160&h=160&fit=crop",
    color: "bg-[#fdf2e9]",
  },
  "flash-sale": {
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=160&h=160&fit=crop",
    color: "bg-[#fff3e0]",
  },
};

const DEFAULT_META = {
  image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=160&h=160&fit=crop",
  color: "bg-[#f5f5f5]",
};

export async function getStoreCategories(): Promise<CategoryWithMeta[]> {
  try {
    const categories = await apiClient<ProductCategory[]>("/products/categories");
    
    return categories.map((cat) => {
      const meta = CATEGORY_META_FALLBACKS[cat.slug] || DEFAULT_META;
      return {
        ...cat,
        ...meta,
      };
    });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return [];
  }
}
