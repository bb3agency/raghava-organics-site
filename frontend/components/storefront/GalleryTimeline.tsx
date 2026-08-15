"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryImage } from "@/lib/gallery-api";
import {
  buildJustifiedRows,
  formatPhotoDate,
  groupByMonth,
  type TimelineSection,
} from "@/lib/gallery-timeline";

/**
 * Phone-gallery-style timeline for the storefront gallery.
 *
 * Follows the pattern people already know from Google Photos / iOS Photos:
 *   • photos grouped into month sections, newest first, with sticky headers;
 *   • justified rows that PRESERVE each photo's aspect ratio instead of
 *     square-cropping every tile (see lib/gallery-timeline);
 *   • a scrub rail down the side to jump between months;
 *   • a full-screen lightbox with keyboard + swipe navigation.
 *
 * Layout maths live in core `lib/gallery-timeline`; this file is the client's
 * themed shell.
 */

interface GalleryTimelineProps {
  items: GalleryImage[];
  storeName: string;
}

/** Target row heights per breakpoint — shorter rows read better on phones. */
function targetRowHeightFor(width: number): number {
  if (width < 480) return 150;
  if (width < 768) return 190;
  if (width < 1280) return 240;
  return 280;
}

export function GalleryTimeline({ items, storeName }: GalleryTimelineProps) {
  const sections = useMemo(() => groupByMonth(items), [items]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeSection, setActiveSection] = useState<string | null>(sections[0]?.key ?? null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  /** Flat, render-order list so the lightbox can walk across section boundaries. */
  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // Measure before paint so rows are laid out at the right width on first frame.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setContainerWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Track which month is on screen so the scrub rail can highlight it.
  useEffect(() => {
    const nodes = [...sectionRefs.current.values()];
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = visible?.target.getAttribute("data-section-key");
        if (key) setActiveSection(key);
      },
      // Bias towards the upper third: the section under the header is "current".
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  const jumpTo = useCallback((key: string) => {
    const node = sectionRefs.current.get(key);
    if (!node) return;
    node.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, []);

  const openAt = useCallback(
    (image: GalleryImage) => {
      const index = flatItems.findIndex((candidate) => candidate.id === image.id);
      if (index >= 0) setLightboxIndex(index);
    },
    [flatItems],
  );

  if (sections.length === 0) {
    return (
      <p className="mt-16 text-center text-sm font-medium text-[#767676]">Photos coming soon.</p>
    );
  }

  return (
    <div className="relative mt-12">
      {/* Scrub rail — desktop only; phones use ordinary scrolling plus the sticky
          headers, which is what mobile galleries themselves do. */}
      <nav
        aria-label="Jump to month"
        className="pointer-events-none absolute right-0 top-0 z-20 hidden h-full lg:block"
      >
        <ul className="pointer-events-auto sticky top-28 flex flex-col items-end gap-1 pr-1">
          {sections.map((section) => {
            const isActive = section.key === activeSection;
            return (
              <li key={section.key}>
                <button
                  type="button"
                  onClick={() => jumpTo(section.key)}
                  aria-current={isActive ? "true" : undefined}
                  className={`group flex items-center gap-2 rounded-full py-1 pl-3 pr-2 text-[11px] font-bold transition-colors ${
                    isActive ? "text-[#23403d]" : "text-[#767676] hover:text-[#23403d]"
                  }`}
                >
                  <span
                    className={`whitespace-nowrap transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {section.shortLabel} {section.year}
                  </span>
                  <span
                    aria-hidden
                    className={`block rounded-full transition-all ${
                      isActive ? "h-1.5 w-6 bg-[#ec6e55]" : "h-1.5 w-3 bg-[#23403d]/25"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div ref={containerRef} className="lg:pr-24">
        {sections.map((section) => (
          <TimelineSectionBlock
            key={section.key}
            section={section}
            containerWidth={containerWidth}
            storeName={storeName}
            onOpen={openAt}
            registerRef={(node) => {
              if (node) sectionRefs.current.set(section.key, node);
              else sectionRefs.current.delete(section.key);
            }}
          />
        ))}
      </div>

      {lightboxIndex !== null && flatItems[lightboxIndex] && (
        <Lightbox
          items={flatItems}
          index={lightboxIndex}
          storeName={storeName}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function TimelineSectionBlock({
  section,
  containerWidth,
  storeName,
  onOpen,
  registerRef,
}: {
  section: TimelineSection;
  containerWidth: number;
  storeName: string;
  onOpen: (image: GalleryImage) => void;
  registerRef: (node: HTMLElement | null) => void;
}) {
  const gap = 8;
  const rows = useMemo(
    () =>
      buildJustifiedRows(section.items, {
        containerWidth,
        targetRowHeight: targetRowHeightFor(containerWidth),
        gap,
      }),
    [section.items, containerWidth],
  );

  return (
    <section ref={registerRef} data-section-key={section.key} className="scroll-mt-24">
      {/* Sticky month header, exactly like a phone gallery's date separators. */}
      <div className="sticky top-16 z-10 -mx-4 mb-3 bg-[#faf8f5]/90 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-[#23403d] sm:text-xl">
          <CalendarDays className="size-4 text-[#ec6e55]" aria-hidden />
          {section.label}
          <span className="text-xs font-semibold text-[#767676]">
            {section.items.length} photo{section.items.length === 1 ? "" : "s"}
          </span>
        </h2>
      </div>

      <div className="mb-10 flex flex-col" style={{ gap }}>
        {/* Before measurement the rows are empty; render nothing rather than a
            wrong-width flash. The first paint after measure is correct. */}
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex" style={{ gap }}>
            {row.map((tile) => (
              <button
                key={tile.image.id}
                type="button"
                onClick={() => onOpen(tile.image)}
                style={{ width: tile.width, height: tile.height }}
                className="group relative shrink-0 overflow-hidden rounded-xl bg-[#dbe8d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ec6e55] focus-visible:ring-offset-2"
                aria-label={
                  tile.image.caption ||
                  tile.image.altText ||
                  `Open photo from ${formatPhotoDate(tile.image.timelineDate)}`
                }
              >
                <Image
                  src={tile.image.imageUrl}
                  alt={tile.image.altText || `${storeName} gallery photo`}
                  fill
                  sizes={`${Math.max(tile.width, 1)}px`}
                  className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105"
                />
                {tile.image.caption && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#23403d]/85 to-transparent p-3 pt-8 text-left text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                    {tile.image.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Lightbox({
  items,
  index,
  storeName,
  onClose,
  onNavigate,
}: {
  items: GalleryImage[];
  index: number;
  storeName: string;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  const image = items[index]!;
  const touchStartX = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const goPrev = useCallback(() => {
    onNavigate((index - 1 + items.length) % items.length);
  }, [index, items.length, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate((index + 1) % items.length);
  }, [index, items.length, onNavigate]);

  // Keyboard nav + focus handling. Escape closes, arrows page, and the dialog
  // takes focus so screen readers announce it.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    // Prevent the page behind from scrolling while the lightbox is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [goNext, goPrev, onClose]);

  const photoDate = formatPhotoDate(image.timelineDate);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.caption || `Photo from ${photoDate}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchStartX.current = null;
        if (start === null || end === null) return;
        const delta = end - start;
        // 48px threshold keeps a tap from registering as a swipe.
        if (delta > 48) goPrev();
        else if (delta < -48) goNext();
      }}
    >
      <div className="flex items-center justify-between gap-4 p-4 text-white">
        <p className="text-xs font-semibold tabular-nums text-white/70">
          {index + 1} / {items.length}
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* stopPropagation so clicking the photo itself does not close the dialog. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4"
        onClick={(event) => event.stopPropagation()}
      >
        {items.length > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="absolute left-2 z-10 hidden rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:block"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}

        <div className="relative h-full w-full">
          <Image
            key={image.id}
            src={image.imageUrl}
            alt={image.altText || `${storeName} gallery photo`}
            fill
            sizes="100vw"
            priority
            className="object-contain"
          />
        </div>

        {items.length > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="absolute right-2 z-10 hidden rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:block"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        )}
      </div>

      <div className="p-4 text-center text-white" onClick={(event) => event.stopPropagation()}>
        {image.caption && <p className="text-sm font-semibold">{image.caption}</p>}
        {photoDate && <p className="mt-0.5 text-xs text-white/60">{photoDate}</p>}
        {items.length > 1 && (
          <p className="mt-2 text-[11px] text-white/40 sm:hidden">Swipe to browse</p>
        )}
      </div>
    </div>
  );
}
