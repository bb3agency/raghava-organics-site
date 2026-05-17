"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, User } from "lucide-react";
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
    <nav
      className="flex items-center gap-6 text-sm font-medium"
      aria-label="Main"
    >
      <Link href="/products" className="hover:text-foreground/80">
        Shop
      </Link>
      <Link
        href="/cart"
        className="inline-flex items-center gap-1 hover:text-foreground/80"
        aria-label="Shopping cart"
      >
        <ShoppingBag className="size-4" aria-hidden />
        Cart
      </Link>
      {showAdmin ? (
        <Link
          href="/admin"
          className="hover:text-foreground/80"
          aria-label="Admin dashboard"
        >
          Admin
        </Link>
      ) : null}
      {isSignedIn ? (
        <>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 hover:text-foreground/80"
            aria-label="Your account"
          >
            <User className="size-4" aria-hidden />
            Account
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="hover:text-foreground/80"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login" className="hover:text-foreground/80">
          Sign in
        </Link>
      )}
    </nav>
  );
}
