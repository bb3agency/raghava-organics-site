import type { ReactNode } from "react";
import { AdminGuard } from "@/components/auth/AdminGuard";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";
import { AdminSessionWarning } from "@/components/auth/AdminSessionWarning";
import { AdminNav } from "@/components/admin/AdminNav";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminGuard>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Merchant admin
          </p>
          <h1 className="font-heading mt-2 text-3xl font-semibold">Admin Read Surfaces</h1>
        </header>
        <AdminNav />
        <AdminSessionWarning />
        <AdminRouteGuard>{children}</AdminRouteGuard>
      </div>
    </AdminGuard>
  );
}
