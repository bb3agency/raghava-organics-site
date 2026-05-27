import Script from "next/script";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { COD_ENABLED } from "@/lib/constants";

export const metadata = {
  title: "Checkout",
};

export default function CheckoutPage() {
  return (
    <div className="flex flex-col bg-[#eff5ee] min-h-screen pb-16">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />
      {/* ── Page Header Banner ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#dbe8d8] py-12 md:py-20">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
          <h1 className="mb-4 font-heading text-4xl font-bold text-[#23403d] md:text-5xl">
            Checkout
          </h1>
          <nav className="flex items-center gap-2 text-sm font-bold text-[#767676]" aria-label="Breadcrumb">
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
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-12 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[60%_40%] lg:items-start">
          <CheckoutForm isCodEnabled={COD_ENABLED} />
          
          <aside className="rounded-[20px] bg-white p-6 shadow-sm lg:p-8">
            <h2 className="mb-6 font-heading text-xl font-bold text-[#23403d]">Checkout Information</h2>
            <ul className="list-disc space-y-3 pl-5 text-sm font-medium text-[#767676]">
              <li>
                <strong className="text-[#23403d]">PREPAID:</strong> Processed via Razorpay securely. Your cart will be verified post-payment.
              </li>
              <li>
                <strong className="text-[#23403d]">COD:</strong> Available exclusively on eligible orders. Cash on Delivery skips online payment.
              </li>
              <li>Shipping and total amounts are calculated live from the server based on your pincode.</li>
            </ul>
          </aside>
        </div>
      </section>
    </div>
  );
}
