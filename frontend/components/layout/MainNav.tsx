"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, User, Search, LogOut, LayoutDashboard } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { canAccessAdmin } from "@/lib/permissions";
import { logoutSession } from "@/lib/auth-api";
import { useCartStore } from "@/stores/cart";
import { useCartSync } from "@/hooks/use-cart-sync";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";

export function MainNav() {
  useSessionBootstrap();
  useCartSync();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const clearCart = useCartStore((s) => s.clearCart);
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const isSignedIn = Boolean(user);
  const showAdmin = canAccessAdmin(user);

  const onSignOut = async () => {
    try {
      await logoutSession(accessToken);
    } catch {
      // Ignore API logout failures and clear client session anyway.
    } finally {
      clearSession();
      clearCart();
      router.push("/login");
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Search */}
      <Link
        href="/search"
        className="inline-flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
        aria-label="Search products"
      >
        <Search className="size-4" aria-hidden />
      </Link>

      {/* Cart */}
      <Link
        href="/cart"
        className="relative inline-flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
        aria-label={`Shopping cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
      >
        <ShoppingBag className="size-4" aria-hidden />
        {cartCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold leading-none text-accent-foreground">
            {cartCount > 9 ? "9+" : cartCount}
          </span>
        )}
      </Link>

      {/* Admin shortcut */}
      {showAdmin ? (
        <Link
          href="/admin"
          className="inline-flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
          aria-label="Admin dashboard"
        >
          <LayoutDashboard className="size-4" aria-hidden />
        </Link>
      ) : null}

      {/* Account / Sign in */}
      {isSignedIn ? (
        <>
          <Link
            href="/dashboard"
            className="inline-flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
            aria-label="Your account"
          >
            <User className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
            aria-label="Sign out"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </>
      ) : (
        <Link
          href="/login"
          className="ml-1 inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign in
        </Link>
      )}

      {/* Mobile: Shop link */}
      <Link
        href="/products"
        className="ml-1 inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary md:hidden"
        aria-label="Browse all products"
      >
        Shop
      </Link>
    </div>
  );
}
