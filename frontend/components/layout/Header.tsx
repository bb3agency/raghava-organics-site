import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { MainNav } from "@/components/layout/MainNav";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight"
          aria-label={`${APP_NAME} home`}
        >
          {APP_NAME}
        </Link>
        <MainNav />
      </div>
    </header>
  );
}
