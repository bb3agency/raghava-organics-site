import Link from "next/link";
import { Leaf } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { MainNav } from "@/components/layout/MainNav";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 lg:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-heading text-xl font-bold tracking-tight text-primary"
          aria-label={`${APP_NAME} home`}
        >
          <Leaf className="size-5 text-accent" aria-hidden />
          {APP_NAME}
        </Link>

        {/* Nav links — center */}
        <nav
          className="hidden items-center gap-6 text-sm font-medium text-foreground/80 md:flex"
          aria-label="Store navigation"
        >
          <Link href="/products" className="transition-colors hover:text-primary">
            Shop
          </Link>
          <Link href="/categories/fresh" className="transition-colors hover:text-primary">
            Fresh
          </Link>
          <Link href="/categories/staples" className="transition-colors hover:text-primary">
            Staples
          </Link>
          <Link href="/products?sort=featured" className="transition-colors hover:text-primary">
            Offers
          </Link>
        </nav>

        {/* Actions — right */}
        <MainNav />
      </div>
    </header>
  );
}
