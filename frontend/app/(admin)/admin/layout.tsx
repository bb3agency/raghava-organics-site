import type { ReactNode } from "react";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";
import { AdminSessionWarning } from "@/components/auth/AdminSessionWarning";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AdminSessionWarning />
      <AdminRouteGuard>{children}</AdminRouteGuard>
    </>
  );
}
