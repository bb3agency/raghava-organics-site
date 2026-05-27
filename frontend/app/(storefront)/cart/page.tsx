import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CartWorkspace } from "@/components/cart/CartWorkspace";

export const metadata = {
  title: "Your Cart",
};

export default function CartPage() {
  return (
    <div className="flex flex-col bg-[#eff5ee] min-h-screen pb-16">
      {/* ── Page Header Banner ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#dbe8d8] py-12 md:py-20">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
          <h1 className="mb-4 font-heading text-4xl font-bold text-[#23403d] md:text-5xl">
            Shopping Cart
          </h1>
          <nav className="flex items-center gap-2 text-sm font-bold text-[#767676]" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#ec6e55] transition-colors">Home</Link>
            <ChevronRight className="size-3" />
            <Link href="/products" className="hover:text-[#ec6e55] transition-colors">Shop</Link>
            <ChevronRight className="size-3" />
            <span className="text-[#ec6e55]">Cart</span>
          </nav>
        </div>
        {/* Decorative elements */}
        <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl" aria-hidden />
        <div className="absolute -left-16 top-0 size-48 rounded-full bg-white opacity-40 blur-3xl" aria-hidden />
      </section>

      {/* ── Cart Workspace ────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-12 lg:px-8">
        <CartWorkspace />
      </section>
    </div>
  );
}
