"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X, Settings2 } from "lucide-react";
import { ADMIN_NAV_ITEMS, isAdminNavActive } from "@/components/admin/admin-nav-config";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";
import { AdminIdleTimeoutModal } from "@/components/auth/AdminIdleTimeoutModal";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { isAdminUser, canViewAdminRoute } from "@/lib/permissions";
import { logoutSession } from "@/lib/auth-api";

interface AdminConsoleShellProps {
  children: ReactNode;
}

export function AdminConsoleShell({ children }: AdminConsoleShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!isAdminUser(user)) {
      router.replace("/admin/login");
    }
  }, [user, router]);

  const closeMobileNav = () => setMobileNavOpen(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logoutSession(accessToken);
    } finally {
      clearSession();
      router.replace("/admin/login");
      setLoggingOut(false);
    }
  }

  if (!isAdminUser(user)) {
    return (
      <div className="admin-console flex min-h-screen items-center justify-center bg-[#faf3ef]">
        <AdminLoadingBlock label="Redirecting to sign in…" />
      </div>
    );
  }

  // Filter nav items based on user's admin permissions
  const permittedNavItems = ADMIN_NAV_ITEMS.filter(item => 
    canViewAdminRoute(user, item.routeKey)
  );

  return (
    <AdminSessionProvider>
      <div className="admin-console flex min-h-screen bg-[#faf3ef] text-[#23403d]">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-64 shrink-0 flex-col border-r border-[#efe8e4] bg-white lg:flex"
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
                      ? "bg-[#23403d] text-white shadow-sm"
                      : "text-[#4a6b68] hover:bg-[#faf3ef] hover:text-[#23403d]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-white" : "text-[#769b97] group-hover:text-[#23403d]",
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        "text-[10px] leading-tight",
                        active ? "text-white/80" : "text-[#769b97]",
                      )}
                    >
                      {item.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-[#efe8e4] p-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-[#efe8e4] text-[#23403d] hover:bg-[#faf3ef] hover:text-[#ec6e55]"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </aside>

        {/* Mobile drawer backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-[#23403d]/40 backdrop-blur-sm lg:hidden"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
        )}

        {/* Mobile drawer */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white transition-transform duration-300 ease-in-out lg:hidden shadow-xl",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-[#efe8e4] px-4 py-4">
            <AdminSidebarBrand />
            <Button
              variant="ghost"
              size="icon"
              onClick={closeMobileNav}
              className="h-8 w-8 text-[#769b97] hover:bg-[#faf3ef] hover:text-[#23403d]"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close sidebar</span>
            </Button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {permittedNavItems.map((item) => {
              const active = isAdminNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileNav}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#23403d] text-white shadow-sm"
                      : "text-[#4a6b68] hover:bg-[#faf3ef] hover:text-[#23403d]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-white" : "text-[#769b97] group-hover:text-[#23403d]",
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        "text-[10px] leading-tight",
                        active ? "text-white/80" : "text-[#769b97]",
                      )}
                    >
                      {item.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-[#efe8e4] p-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-[#efe8e4] text-[#23403d] hover:bg-[#faf3ef] hover:text-[#ec6e55]"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile topbar */}
          <header className="flex h-14 items-center gap-4 border-b border-[#efe8e4] bg-white px-4 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="-ml-2 h-9 w-9 text-[#4a6b68] hover:bg-[#faf3ef] hover:text-[#23403d]"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open sidebar</span>
            </Button>
            <div className="flex items-center gap-2 font-bold tracking-tight text-[#23403d]">
              <Settings2 className="h-5 w-5 text-[#ec6e55]" />
              <span>Admin Console</span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>

        <AdminIdleTimeoutModal />
      </div>
    </AdminSessionProvider>
  );
}

function AdminSidebarBrand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-[#efe8e4] px-6">
      <Settings2 className="h-5 w-5 text-[#ec6e55]" />
      <span className="font-bold tracking-tight text-[#23403d]">Admin Console</span>
    </div>
  );
}
