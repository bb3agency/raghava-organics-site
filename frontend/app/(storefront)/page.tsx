import Link from "next/link";
import { Suspense } from "react";
import { BackendStatus } from "@/components/shared/BackendStatus";
import { APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-16 md:py-24">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Premium organic essentials
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
          Welcome to {APP_NAME}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Foundation slice: API client, refresh-on-401, error-code mapping, and
          permission-aware navigation are in place.
        </p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Checking backend…</p>}>
          <BackendStatus />
        </Suspense>
      </div>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/products"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
          aria-label="Browse products"
        >
          Browse products
        </Link>
        <Link
          href="/cart"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-6 text-sm font-medium"
          aria-label="View cart"
        >
          View cart
        </Link>
      </div>
    </section>
  );
}
