"use client";

import Link from "next/link";
import { Leaf, Phone, Menu } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { MainNav } from "@/components/layout/MainNav";
import { SearchInput } from "@/components/shared/SearchInput";
import { MobileNav } from "@/components/layout/MobileNav";
import { useUiStore } from "@/stores/ui";

export function Header() {
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);

  return (
    <>
      <MobileNav />
      <header className="sticky top-0 z-50 w-full border-b border-[#efe8e4] bg-white shadow-sm transition-all">
      {/* Top Banner */}
      <div className="hidden bg-[#23403d] px-4 py-1.5 text-center text-xs font-medium text-white sm:block">
        Free delivery on orders over <span className="font-bold text-[#ec6e55]">₹499</span>. Shop fresh organic produce today!
      </div>

      {/* Main Header */}
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between gap-4 px-4 lg:gap-8 lg:px-8">
        
        {/* Mobile Menu Toggle & Logo */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="flex size-10 items-center justify-center rounded-full bg-[#eff5ee] text-[#23403d] lg:hidden" 
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-heading text-2xl font-bold tracking-tight text-[#23403d]"
            aria-label={`${APP_NAME} home`}
          >
            <Leaf className="size-6 text-[#ec6e55]" aria-hidden />
            {APP_NAME}
          </Link>
        </div>

        {/* Central Search (Desktop) */}
        <div className="hidden flex-1 max-w-2xl lg:block">
          <div className="relative w-full">
            <SearchInput />
          </div>
        </div>

        {/* Support & Actions */}
        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-3 lg:flex">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#eff5ee] text-[#ec6e55]">
              <Phone className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#767676]">Call Us 24/7</span>
              <a href="tel:+919876543210" className="text-sm font-bold text-[#23403d] hover:text-[#ec6e55]">+91 98765 43210</a>
            </div>
          </div>
          
          <div className="h-8 w-px bg-[#efe8e4] hidden lg:block" aria-hidden="true" />
          
          <MainNav />
        </div>
      </div>

      {/* Navigation Row */}
      <div className="hidden border-t border-[#efe8e4] bg-white lg:block">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-8">
          <Link href="/products" className="flex h-14 items-center gap-2 bg-[#23403d] px-6 text-sm font-bold text-white transition-colors hover:bg-[#1a302e]">
            <Menu className="size-4" /> Browse Categories
          </Link>
          
          <nav
            className="flex items-center gap-8 text-sm font-bold text-[#23403d]"
            aria-label="Store navigation"
          >
            <Link href="/" className="transition-colors hover:text-[#ec6e55]">Home</Link>
            <Link href="/products" className="transition-colors hover:text-[#ec6e55]">Shop</Link>
            <Link href="/categories/fresh-vegetables" className="transition-colors hover:text-[#ec6e55]">Vegetables</Link>
            <Link href="/categories/fruits" className="transition-colors hover:text-[#ec6e55]">Fruits</Link>
            <Link href="/categories/dairy-eggs" className="transition-colors hover:text-[#ec6e55]">Dairy & Eggs</Link>
            <Link href="/products?sort=featured" className="flex items-center gap-1 text-[#ec6e55] transition-colors hover:text-[#23403d]">
              Special Offers <Leaf className="size-3" />
            </Link>
          </nav>
        </div>
      </div>
    </header>
    </>
  );
}
