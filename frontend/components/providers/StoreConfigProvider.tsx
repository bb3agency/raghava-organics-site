"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicStoreConfig } from "@/lib/storefront-settings";

const StoreConfigContext = createContext<PublicStoreConfig | null>(null);

export function StoreConfigProvider({
  config,
  children,
}: {
  config: PublicStoreConfig;
  children: ReactNode;
}) {
  return (
    <StoreConfigContext.Provider value={config}>{children}</StoreConfigContext.Provider>
  );
}

/** Runtime storefront settings from GET /store/config (preferred over build-time env flags). */
export function useStoreConfig(): PublicStoreConfig {
  const config = useContext(StoreConfigContext);
  if (!config) {
    throw new Error("useStoreConfig must be used within StoreConfigProvider");
  }
  return config;
}
