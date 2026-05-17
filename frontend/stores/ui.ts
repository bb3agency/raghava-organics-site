"use client";

import { create } from "zustand";

interface UiState {
  cartSheetOpen: boolean;
  setCartSheetOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  cartSheetOpen: false,
  setCartSheetOpen: (open) => set({ cartSheetOpen: open }),
}));
