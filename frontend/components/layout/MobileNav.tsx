"use client";

import Link from "next/link";
import { Leaf, X, User, LogOut, LayoutDashboard, Search, Store } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { canAccessAdmin } from "@/lib/permissions";
import { logoutSession } from "@/lib/auth-api";
import { useCartStore } from "@/stores/cart";

export function MobileNav() {
  const mobileMenuOpen = useUiStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);
  
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
      // Ignore
    } finally {
      clearSession();
      clearCart();
      setMobileMenuOpen(false);
    }
  };

  if (!mobileMenuOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity lg:hidden"
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      
      <div className="fixed inset-y-0 left-0 z-[101] w-4/5 max-w-sm bg-white p-6 shadow-2xl transition-transform lg:hidden flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-[#23403d]"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Leaf className="size-5 text-[#ec6e55]" />
            {APP_NAME}
          </Link>
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-full bg-[#eff5ee] p-2 text-[#23403d] hover:bg-[#ec6e55] hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#767676]" />
          <form action="/search" onSubmit={() => setMobileMenuOpen(false)}>
            <input 
              name="q"
              placeholder="Search products..."
              className="w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] py-2.5 pl-9 pr-4 text-sm focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
            />
          </form>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#767676]">Navigation</p>
          <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef] hover:text-[#ec6e55]">
            <Store className="size-4" /> Home
          </Link>
          <Link href="/products" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef] hover:text-[#ec6e55]">
            <Search className="size-4" /> All Products
          </Link>
          
          <div className="my-4 h-px w-full bg-[#efe8e4]" />
          
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#767676]">Account</p>
          {showAdmin && (
            <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef]">
              <LayoutDashboard className="size-4" /> Admin Panel
            </Link>
          )}
          {isSignedIn ? (
            <>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef]">
                <User className="size-4" /> Dashboard
              </Link>
              <button onClick={onSignOut} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#23403d] hover:bg-[#faf3ef]">
                <LogOut className="size-4" /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef]">
                <LogOut className="size-4" /> Sign In
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-[#23403d] hover:bg-[#faf3ef]">
                <User className="size-4" /> Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}
