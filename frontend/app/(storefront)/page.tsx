import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Leaf, Truck, RotateCcw, ShieldCheck, Star, ArrowRight, Timer } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/product/ProductCardSkeleton";
import { NewsletterForm } from "@/components/shared/NewsletterForm";
import type { Product } from "@/types/product";

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const payload = await apiClient<unknown>("/products?limit=10&sort=popularity");
    return mapProductListResponse(payload);
  } catch {
    return [];
  }
}

async function FeaturedProducts() {
  const featured = await getFeaturedProducts();
  
  if (featured.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center text-[#767676]">
        <Leaf className="size-12 opacity-30" aria-hidden />
        <p className="font-bold text-[#23403d]">Products coming soon</p>
        <p className="text-sm">We&apos;re stocking up. Check back shortly!</p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {featured.map((product, i) => (
        <div key={product.id} className="rounded-[20px] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <ProductCard product={product} priority={i < 4} />
        </div>
      ))}
    </div>
  );
}

const CATEGORIES = [
  { label: "Fresh Vegetables", slug: "fresh-vegetables", image: "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=160&h=160&fit=crop", color: "bg-[#e8f5e9]" },
  { label: "Fresh Fruits", slug: "fruits", image: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=160&h=160&fit=crop", color: "bg-[#ffebee]" },
  { label: "Dairy & Eggs", slug: "dairy-eggs", image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=160&h=160&fit=crop", color: "bg-[#fff8e1]" },
  { label: "Bakery", slug: "bakery", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=160&h=160&fit=crop", color: "bg-[#fff3e0]" },
  { label: "Meat & Seafood", slug: "meat", image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=160&h=160&fit=crop", color: "bg-[#fce4ec]" },
  { label: "Drinks", slug: "drinks", image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=160&h=160&fit=crop", color: "bg-[#e3f2fd]" },
];

const TRUST_ITEMS = [
  { icon: Truck, title: "Free Shipping", desc: "On orders over ₹499" },
  { icon: RotateCcw, title: "Returns Policy", desc: "Returns within 7 days" },
  { icon: ShieldCheck, title: "100% Secure", desc: "Your payments are safe" },
  { icon: Star, title: "Best Quality", desc: "Organic certified products" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col bg-[#eff5ee]">
      {/* ── Hero Grid (Tasty Daily Style) ──────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Hero Banner */}
          <div className="relative flex min-h-[400px] flex-col justify-center overflow-hidden rounded-[20px] bg-[#dbe8d8] p-8 text-[#23403d] lg:col-span-2 lg:min-h-[500px] lg:p-14">
            <span className="mb-4 inline-block rounded-full bg-[#ec6e55] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white w-fit">
              100% Organic
            </span>
            <h1 className="mb-4 max-w-lg font-heading text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
              Fresh & Healthy <br /> Organic Food
            </h1>
            <p className="mb-8 max-w-md text-base text-[#23403d]/80 md:text-lg">
              Get the best organic products delivered straight to your door with free shipping on your first order.
            </p>
            <div>
              <Link
                href="/products"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#23403d] px-8 text-sm font-bold text-white transition-transform hover:-translate-y-1 hover:shadow-lg"
              >
                Shop Now <ArrowRight className="ml-2 size-4" />
              </Link>
            </div>
            {/* Decorative background element simulating image placement */}
            <div className="absolute -bottom-10 -right-10 size-[300px] rounded-full bg-[#c5dac2] opacity-50 blur-3xl lg:size-[500px]" aria-hidden />
          </div>

          {/* Secondary Banners */}
          <div className="flex flex-col gap-6">
            <div className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[20px] bg-[#faf3ef] p-8 text-[#23403d]">
              <span className="mb-2 text-sm font-semibold text-[#ec6e55]">Weekend Deal</span>
              <h3 className="mb-4 font-heading text-2xl font-bold">Organic <br />Vegetables</h3>
              <Link href="/categories/fresh-vegetables" className="text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[#ec6e55]">
                Shop Now
              </Link>
            </div>
            <div className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[20px] bg-[#fff5db] p-8 text-[#23403d]">
              <span className="mb-2 text-sm font-semibold text-[#ec6e55]">New Arrivals</span>
              <h3 className="mb-4 font-heading text-2xl font-bold">Fresh <br />Farm Fruits</h3>
              <Link href="/categories/fruits" className="text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[#ec6e55]">
                Shop Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Bar ─────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 pb-8 lg:px-8">
        <div className="grid grid-cols-2 gap-4 rounded-[20px] bg-white p-6 shadow-sm md:grid-cols-4 lg:p-8">
          {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eff5ee]">
                <Icon className="size-5 text-[#23403d]" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold text-[#23403d]">{title}</p>
                <p className="text-xs text-[#767676]">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-bold text-[#23403d] md:text-3xl">
            Explore Categories
          </h2>
          <Link href="/products" className="text-sm font-bold text-[#23403d] hover:text-[#ec6e55]">
            View All Categories →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6 lg:gap-6">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group flex flex-col items-center justify-center gap-4 rounded-[20px] bg-white p-6 text-center shadow-sm transition-all hover:shadow-md"
            >
              <div className={`flex size-20 items-center justify-center rounded-full ${cat.color} transition-transform group-hover:scale-110 overflow-hidden`}>
                <Image src={cat.image} alt={cat.label} width={80} height={80} className="size-full object-cover mix-blend-multiply" />
              </div>
              <span className="text-sm font-bold text-[#23403d]">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Deal of the Day (Countdown) ─────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 py-8 lg:px-8">
        <div className="relative overflow-hidden rounded-[20px] bg-[#23403d] p-8 lg:p-14" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=2574&auto=format&fit=crop')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div className="absolute inset-0 bg-[#23403d]/85 mix-blend-multiply" aria-hidden="true" />
          <div className="relative z-10 flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#ec6e55] px-4 py-1.5 text-sm font-bold text-white">
              <Timer className="size-4" /> Limited Time Offer
            </span>
            <h2 className="mb-6 font-heading text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              Deal of the Day <br /> Up to 50% Off
            </h2>
            
            {/* Fake Countdown Timer */}
            <div className="mb-8 flex gap-4 text-white">
              <div className="flex flex-col items-center">
                <div className="flex size-14 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold backdrop-blur-md">12</div>
                <span className="mt-2 text-xs font-semibold uppercase tracking-wider">Hours</span>
              </div>
              <div className="text-2xl font-bold">:</div>
              <div className="flex flex-col items-center">
                <div className="flex size-14 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold backdrop-blur-md">45</div>
                <span className="mt-2 text-xs font-semibold uppercase tracking-wider">Mins</span>
              </div>
              <div className="text-2xl font-bold">:</div>
              <div className="flex flex-col items-center">
                <div className="flex size-14 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold backdrop-blur-md">30</div>
                <span className="mt-2 text-xs font-semibold uppercase tracking-wider">Secs</span>
              </div>
            </div>

            <Link
              href="/products?sort=featured"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold text-[#23403d] transition-transform hover:-translate-y-1 hover:shadow-lg"
            >
              Shop the Deal
            </Link>
          </div>
          {/* Decorative graphic */}
          <div className="absolute right-0 top-0 hidden h-full w-1/2 bg-white/5 lg:block [clip-path:polygon(20%_0%,100%_0%,100%_100%,0%_100%)]" />
        </div>
      </section>

      {/* ── Trending Products ─────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1440px] px-4 py-8 pb-16 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-end">
          <h2 className="font-heading text-2xl font-bold text-[#23403d] md:text-3xl">
            Trending Products
          </h2>
          <div className="flex w-full gap-6 overflow-x-auto pb-2 sm:w-auto sm:pb-0 scrollbar-hide">
            <Link href="/products" className="shrink-0 text-sm font-bold text-[#ec6e55] underline decoration-2 underline-offset-8">All Products</Link>
            <Link href="/categories/fruits" className="shrink-0 text-sm font-bold text-[#767676] transition-colors hover:text-[#23403d]">Fruits</Link>
            <Link href="/categories/fresh-vegetables" className="shrink-0 text-sm font-bold text-[#767676] transition-colors hover:text-[#23403d]">Vegetables</Link>
            <Link href="/categories/dairy-eggs" className="shrink-0 text-sm font-bold text-[#767676] transition-colors hover:text-[#23403d]">Dairy & Eggs</Link>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <FeaturedProducts />
        </Suspense>
      </section>

      {/* ── Newsletter ────────────────────────────────── */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-[1440px] px-4 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 rounded-[20px] bg-[#eff5ee] p-8 lg:flex-row lg:p-14">
            <div className="text-center lg:text-left">
              <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d] md:text-3xl">
                Get <span className="text-[#ec6e55]">20% Off</span> Your First Order
              </h2>
              <p className="text-sm text-[#767676]">
                Subscribe to our newsletter and get a discount coupon.
              </p>
            </div>
            <div className="w-full max-w-md">
              <NewsletterForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
