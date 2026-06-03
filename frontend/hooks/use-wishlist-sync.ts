"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { useWishlistStore } from "@/stores/wishlist";
import { getWishlist } from "@/lib/wishlist-api";

export function useWishlistSync() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setItems = useWishlistStore((s) => s.setItems);
  const clear = useWishlistStore((s) => s.clear);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (!accessToken) {
        clear();
        return;
      }
      try {
        const wishlist = await getWishlist(accessToken, { limit: 100 });
        if (!cancelled) {
          const items = Array.isArray(wishlist.items) ? wishlist.items : [];
          setItems(items.map((i) => i.product.id));
        }
      } catch {
        // Ignore failure, retain local state
      }
    }

    void sync();

    return () => {
      cancelled = true;
    };
  }, [accessToken, setItems, clear]);
}
