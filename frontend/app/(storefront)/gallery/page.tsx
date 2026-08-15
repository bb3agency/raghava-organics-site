import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerApiBaseUrl } from "@/lib/api-base";
import type { GalleryImage } from "@/lib/gallery-api";
import { APP_NAME } from "@/lib/constants";
import { GalleryTimeline } from "@/components/storefront/GalleryTimeline";

export const metadata: Metadata = {
  title: `Gallery | ${APP_NAME}`,
  description:
    "A glimpse into our organic fields, partner farms, and the people who grow your food.",
  alternates: { canonical: "/gallery" },
};

// Rendered dynamically so the merchant's Admin → Gallery changes (enable/disable toggle
// AND newly uploaded images) reflect immediately. An hourly ISR cache previously left the
// route open after it was switched off and hid freshly uploaded photos for up to an hour.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GalleryResponse {
  enabled: boolean;
  items: GalleryImage[];
}

async function fetchGallery(): Promise<GalleryResponse> {
  try {
    const base = getServerApiBaseUrl();
    const res = await fetch(`${base}/gallery`, { cache: "no-store" });
    if (!res.ok) return { enabled: false, items: [] };
    const body: unknown = await res.json();
    const data =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data: unknown }).data
        : body;
    if (typeof data !== "object" || data === null) return { enabled: false, items: [] };
    const record = data as { enabled?: unknown; items?: unknown };
    return {
      enabled: record.enabled === true,
      items: Array.isArray(record.items) ? (record.items as GalleryImage[]) : [],
    };
  } catch {
    return { enabled: false, items: [] };
  }
}

export default async function GalleryPage() {
  const { enabled, items } = await fetchGallery();

  // The merchant controls visibility from Admin → Gallery. When off, the route
  // behaves as if it does not exist.
  if (!enabled) {
    notFound();
  }

  return (
    <main className="bg-[#faf8f5]">
      <section className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#23403d]/15 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#23403d]">
            Our Gallery
          </span>
          <h1 className="mt-5 font-heading text-4xl font-bold leading-tight tracking-tight text-[#23403d] sm:text-5xl">
            From our fields to your kitchen
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#5b6b6a] sm:text-lg">
            A glimpse into the farms, harvests, and people behind {APP_NAME} — newest first.
          </p>
        </div>

        <GalleryTimeline items={items} storeName={APP_NAME} />

      </section>
    </main>
  );
}
