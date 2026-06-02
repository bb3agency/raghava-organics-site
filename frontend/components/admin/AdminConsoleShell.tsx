"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/admin-auth-context";
import { LogOut, Menu, X, Settings2 } from "lucide-react";
import { getAdminNavItems, isAdminNavActive } from "@/components/admin/admin-nav-config";
import { AdminIdleTimeoutModal } from "@/components/auth/AdminIdleTimeoutModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { canViewAdminRoute } from "@/lib/permissions";
import { redirectToAdminLogin } from "@/lib/admin-auth-navigation";
import { logoutSession } from "@/lib/auth-api";

interface AdminConsoleShellProps {
  children: ReactNode;
}

export function AdminConsoleShell({ children }: AdminConsoleShellProps) {
  return (
    <AdminAuthProvider>
      <AdminConsoleFrame>{children}</AdminConsoleFrame>
    </AdminAuthProvider>
  );
}

function AdminConsoleFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { accessToken, adminUser } = useAdminAuth();
  const clearSession = useAuthStore((state) => state.clearSession);

  const closeMobileNav = () => setMobileNavOpen(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logoutSession(accessToken);
    } finally {
      clearSession();
      redirectToAdminLogin();
    }
  }

  const permittedNavItems = getAdminNavItems().filter((item) =>
    canViewAdminRoute(adminUser, item.routeKey),
  );

  return (
    <>
      <div className="admin-console flex min-h-screen bg-background text-foreground">
        <aside
          className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex"
          aria-label="Admin navigation"
        >
          <AdminSidebarBrand />
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {permittedNavItems.map((item) => {
              const active = isAdminNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex flex-col">
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        "text-xs font-normal",
                        active ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border lg:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="font-heading text-lg font-semibold">Admin Console</h1>
            </div>
            <Link
              href="/admin/settings/store"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Settings
            </Link>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
        </div>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close navigation menu"
              onClick={closeMobileNav}
            />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <AdminSidebarBrand />
                <button
                  type="button"
                  onClick={closeMobileNav}
                  aria-label="Close menu"
                  className="rounded-md p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {permittedNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileNav}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium",
                      isAdminNavActive(pathname, item.href)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                >
                  {loggingOut ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
      <AdminIdleTimeoutModal />
    </>
  );
}

function AdminSidebarBrand() {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
        RO
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">Raghava Organics</p>
        <p className="text-xs text-muted-foreground">Merchant admin</p>
      </div>
    </div>
  );
}
