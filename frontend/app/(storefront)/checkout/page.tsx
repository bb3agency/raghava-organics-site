import type { Metadata } from "next";
import { connection } from "next/server";
import Script from "next/script";
import Link from "next/link";
import { ChevronRight, CreditCard, Banknote, Truck, ShieldCheck, AlertCircle } from "lucide-react";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { CheckoutStartedTracker } from "@/components/checkout/CheckoutStartedTracker";
import { NOINDEX_METADATA } from "@/lib/seo";
import { getPublicStoreConfig } from "@/lib/storefront-settings";
import { formatPrice } from "@/lib/format-price";

export const metadata: Metadata = {
  title: "Checkout",
  ...NOINDEX_METADATA,
};

export default async function CheckoutPage() {
  await connection();
  const storeConfig = await getPublicStoreConfig();

  return (
    <div className="flex flex-col bg-[#eff5ee] min-h-screen pb-16">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />
      {/* ── Page Header Banner ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#dbe8d8] py-8 md:py-20">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
          <h1 className="mb-3 font-heading text-2xl font-bold text-[#23403d] sm:mb-4 sm:text-4xl md:text-5xl">
            Checkout
          </h1>
          <nav className="flex items-center gap-1.5 text-xs font-bold text-[#767676] sm:gap-2 sm:text-sm" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#ec6e55] transition-colors">Home</Link>
            <ChevronRight className="size-3" />
            <Link href="/products" className="hover:text-[#ec6e55] transition-colors">Shop</Link>
            <ChevronRight className="size-3" />
            <span className="text-[#ec6e55]">Checkout</span>
          </nav>
        </div>
        {/* Decorative elements */}
        <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl" aria-hidden />
        <div className="absolute -left-16 top-0 size-48 rounded-full bg-white opacity-40 blur-3xl" aria-hidden />
      </section>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <CheckoutStartedTracker />
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:pt-12 lg:px-8">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[60%_40%] lg:items-start">
          <CheckoutForm />

          {/* ── Info Sidebar ─────────────────────────────────────────────── */}
          <aside className="flex flex-col gap-4 rounded-[20px] bg-white p-4 shadow-sm sm:p-6 lg:p-8">
            <h2 className="font-heading text-lg font-bold text-[#23403d] sm:text-xl">
              Order Information
            </h2>

            <div className="flex flex-col gap-3">
              {/* Pay online */}
              <div className="flex items-start gap-3 rounded-[12px] bg-[#faf3ef] p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#23403d]">
                  <CreditCard className="size-4 text-white" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#23403d]">Pay online</p>
                  <p className="mt-0.5 text-xs text-[#767676]">Processed securely via Razorpay — UPI, cards, wallets, net banking.</p>
                </div>
              </div>

              {/* COD */}
              {storeConfig.isCodEnabled ? (
                <div className="flex items-start gap-3 rounded-[12px] bg-[#faf3ef] p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#23403d]">
                    <Banknote className="size-4 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#23403d]">Cash on Delivery</p>
                    <p className="mt-0.5 text-xs text-[#767676]">Pay in cash when your order arrives. No online payment needed.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-[12px] border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <p className="text-xs text-amber-800">Cash on Delivery is currently disabled. Only online payment is accepted.</p>
                </div>
              )}

              {/* Shipping */}
              <div className="flex items-start gap-3 rounded-[12px] bg-[#faf3ef] p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#23403d]">
                  <Truck className="size-4 text-white" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#23403d]">Shipping</p>
                  <p className="mt-0.5 text-xs text-[#767676]">Shipping and totals are calculated live based on your pincode.</p>
                </div>
              </div>

              {/* Minimum order */}
              {storeConfig.minOrderValuePaise > 0 && (
                <div className="flex items-start gap-3 rounded-[12px] bg-[#faf3ef] p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#23403d]">
                    <ShieldCheck className="size-4 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#23403d]">Minimum order</p>
                    <p className="mt-0.5 text-xs text-[#767676]">
                      {formatPrice(storeConfig.minOrderValuePaise)} cart subtotal required to place an order.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Trust badge */}
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#767676]">
              <ShieldCheck className="size-3.5 text-[#23403d]" aria-hidden />
              100% secure & encrypted checkout
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
