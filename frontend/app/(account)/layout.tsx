import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AccountGuard } from "@/components/auth/AccountGuard";

interface AccountLayoutProps {
  children: ReactNode;
}

export default function AccountLayout({ children }: AccountLayoutProps) {
  return (
    <AccountGuard>
      <div className="flex flex-col bg-[#eff5ee] min-h-screen pb-16">
        {/* ── Page Header Banner ──────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#dbe8d8] py-12 md:py-20">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-4 text-center lg:px-8">
            <h1 className="mb-4 font-heading text-4xl font-bold text-[#23403d] md:text-5xl">
              My Account
            </h1>
            <nav className="flex items-center gap-2 text-sm font-bold text-[#767676]" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-[#ec6e55] transition-colors">Home</Link>
              <ChevronRight className="size-3" />
              <span className="text-[#ec6e55]">My Account</span>
            </nav>
          </div>
          {/* Decorative elements */}
          <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-[#c5dac2] opacity-40 blur-3xl" aria-hidden />
          <div className="absolute -left-16 top-0 size-48 rounded-full bg-white opacity-40 blur-3xl" aria-hidden />
        </section>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-[1440px] px-4 pt-12 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[250px_1fr] lg:items-start">
            <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible gap-2 rounded-[20px] bg-white p-4 lg:p-6 shadow-sm scrollbar-none" aria-label="Account">
              <Link href="/dashboard" className="rounded-lg px-4 py-3 text-sm font-bold text-[#23403d] transition-colors hover:bg-[#faf3ef] hover:text-[#ec6e55] whitespace-nowrap flex-1 text-center lg:text-left">Dashboard</Link>
              <Link href="/orders" className="rounded-lg px-4 py-3 text-sm font-bold text-[#23403d] transition-colors hover:bg-[#faf3ef] hover:text-[#ec6e55] whitespace-nowrap flex-1 text-center lg:text-left">Orders</Link>
              <Link href="/settings" className="rounded-lg px-4 py-3 text-sm font-bold text-[#23403d] transition-colors hover:bg-[#faf3ef] hover:text-[#ec6e55] whitespace-nowrap flex-1 text-center lg:text-left">Settings</Link>
            </nav>
            <div className="rounded-[20px] bg-white p-6 shadow-sm lg:p-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </AccountGuard>
  );
}
