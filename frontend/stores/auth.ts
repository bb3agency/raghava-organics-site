"use client";

import { create } from "zustand";
import type { User } from "@/types/user";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  permissions: string[];
  setSession: (accessToken: string, user: User) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  permissions: [],
  setSession: (accessToken, user) =>
    set({
      accessToken,
      user,
      permissions: user.permissions ?? [],
    }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () =>
    set({ accessToken: null, user: null, permissions: [] }),
  hasPermission: (permission) => {
    const perms = get().permissions;
    return perms.includes(permission) || perms.includes("*");
  },
}));
