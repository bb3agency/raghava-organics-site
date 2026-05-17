import type { ReactNode } from "react";
import Link from "next/link";
import { AccountGuard } from "@/components/auth/AccountGuard";

interface AccountLayoutProps {
  children: ReactNode;
}

export default function AccountLayout({ children }: AccountLayoutProps) {
  return (
    <AccountGuard>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <nav className="mb-8 flex gap-4 text-sm" aria-label="Account">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/orders">Orders</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        {children}
      </div>
    </AccountGuard>
  );
}
