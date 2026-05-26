import Link from "next/link";
import { Suspense } from "react";
import { Leaf, Truck, RotateCcw, ShieldCheck, Star } from "lucide-react";
import { apiClient } from "@/lib/api";
import { mapProductListResponse } from "@/lib/product-adapters";
import { ProductCard } from "@/components/product/ProductCard";
import { NewsletterForm } from "@/components/shared/NewsletterForm";
import type { Product } from "@/types/product";

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const payload = await apiClient<unknown>("/products?limit=8&sort=featured");
    return mapProductListResponse(payload);
  } catch {
    return [];
  }
}

const CATEGORIES = [
  { label: "Fresh Vegetables", slug: "fresh-vegetables", emoji: "🥦", color: "bg-green-50 hover:bg-green-100" },
  { label: "Fruits", slug: "fruits", emoji: "🍎", color: "bg-red-50 hover:bg-red-100" },
  { label: "Rice & Grains", slug: "rice-grains", emoji: "🌾", color: "bg-amber-50 hover:bg-amber-100" },
  { label: "Dairy & Eggs", slug: "dairy-eggs", emoji: "🥚", color: "bg-yellow-50 hover:bg-yellow-100" },
  { label: "Pulses", slug: "pulses", emoji: "🫘", color: "bg-orange-50 hover:bg-orange-100" },
  { label: "Herbs & Spices", slug: "herbs-spices", emoji: "🌿", color: "bg-lime-50 hover:bg-lime-100" },
];

const TRUST_ITEMS = [
  { icon: Truck, title: "Free Delivery", desc: "On orders above ₹499" },
  { icon: Leaf, title: "100% Organic", desc: "Certified pesticide-free" },
  { icon: RotateCcw, title: "Easy Returns", desc: "7-day return policy" },
  { icon: ShieldCheck, title: "Secure Payments", desc: "SSL encrypted checkout" },
];

export default async function HomePage() {
  const featured = await getFeaturedProducts();

  return (
    <div className="flex flex-col">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-primary">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 py-16 text-center lg:px-6 lg:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 px-4 py-1.5 text-xs font-semibold text-primary-foreground/80">
            <Leaf className="size-3.5 text-accent" aria-hidden />
            Farm-to-table organic goodness
          </div>

          <h1 className="max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-5xl lg:text-6xl">
            Fresh, Pure &amp;{" "}
            <span className="text-accent">Organic</span> — Delivered to You
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-primary-foreground/70 md:text-lg">
            Shop seasonal vegetables, grains, fruits, and staples — sourced
            directly from certified organic farms across India.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-bold text-accent-foreground shadow transition-colors hover:bg-accent/90"
              aria-label="Shop all organic products"
            >
              Shop Now
            </Link>
            <Link
              href="/products?sort=featured"
              className="inline-flex h-12 items-center justify-center rounded-full border border-primary-foreground/30 px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              View Offers
            </Link>
          </div>

          {/* Social proof strip */}
          <div className="flex items-center gap-2 text-sm text-primary-foreground/60">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="size-4 fill-accent text-accent" aria-hidden />
              ))}
            </div>
            <span>Trusted by <strong className="text-primary-foreground">2,000+</strong> families</span>
          </div>
        </div>

        {/* decorative bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-background [clip-path:ellipse(60%_100%_at_50%_100%)]" />
      </section>

      {/* ── Categories ────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 lg:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">
              Browse by category
            </p>
            <h2 className="mt-1 font-heading text-2xl font-bold text-foreground md:text-3xl">
              What are you looking for?
            </h2>
          </div>
          <Link
            href="/products"
            className="hidden text-sm font-semibold text-primary underline-offset-2 hover:underline sm:inline"
          >
            See all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-border p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${cat.color}`}
              aria-label={`Browse ${cat.label}`}
            >
              <span className="text-3xl" role="img" aria-hidden>
                {cat.emoji}
              </span>
              <span className="text-xs font-semibold text-foreground leading-tight">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured Products ─────────────────────────────── */}
      <section className="bg-secondary/40 py-14">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                Handpicked for you
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold text-foreground md:text-3xl">
                Featured Products
              </h2>
            </div>
            <Link
              href="/products"
              className="hidden text-sm font-semibold text-primary underline-offset-2 hover:underline sm:inline"
            >
              View all →
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 animate-pulse rounded-2xl bg-border"
                    aria-hidden
                  />
                ))}
              </div>
            }
          >
            {featured.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {featured.map((product, i) => (
                  <ProductCard key={product.id} product={product} priority={i < 4} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
                <Leaf className="size-12 opacity-30" aria-hidden />
                <p className="font-semibold">Products coming soon</p>
                <p className="text-sm">
                  We&apos;re stocking up. Check back shortly!
                </p>
              </div>
            )}
          </Suspense>

          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/products"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
            >
              Shop all products
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust Bar ─────────────────────────────────────── */}
      <section className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="size-5 text-primary" aria-hidden />
                </div>
                <p className="text-sm font-bold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Newsletter CTA ────────────────────────────────── */}
      <section className="bg-primary/5 py-14">
        <div className="mx-auto max-w-2xl px-4 text-center lg:px-6">
          <Leaf className="mx-auto mb-4 size-8 text-accent" aria-hidden />
          <h2 className="font-heading text-2xl font-bold text-foreground md:text-3xl">
            Get 10% off your first order
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Subscribe for exclusive deals, seasonal produce alerts, and organic
            living tips.
          </p>
          <div className="mt-6">
            <NewsletterForm />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No spam, ever. Unsubscribe at any time.
          </p>
        </div>
      </section>
    </div>
  );
}
