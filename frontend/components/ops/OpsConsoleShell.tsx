"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getOpsSessionClient,
  isOpsUnauthorisedError,
  logoutOpsSession,
  type OpsSession,
} from "@/lib/ops-client-api";

interface OpsConsoleShellProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: "/ops", label: "Session" },
  { href: "/ops/load-shed", label: "Load shed" },
  { href: "/ops/config", label: "Config" },
  { href: "/ops/audit", label: "Audit" },
  { href: "/ops/invites", label: "Invites" },
  { href: "/ops/users", label: "Users" },
  { href: "/ops/queues", label: "Queues" },
  { href: "/ops/system", label: "System" },
  { href: "/ops/metrics", label: "Metrics" },
] as const;

export function OpsConsoleShell({ children }: OpsConsoleShellProps) {
  const router = useRouter();
  const [session, setSession] = useState<OpsSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextSession = await getOpsSessionClient();
        if (!cancelled) {
          setSession(nextSession);
        }
      } catch (err) {
        if (!cancelled) {
          setSession(null);
          if (isOpsUnauthorisedError(err)) {
            router.replace("/ops/login");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logoutOpsSession();
    } finally {
      router.replace("/ops/login");
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading ops session…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Redirecting to ops sign in…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Ops control plane
          </p>
          <h1 className="font-heading mt-2 text-3xl font-semibold">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {session.name} ({session.email})
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>
      <nav className="mb-8 flex flex-wrap gap-4 text-sm" aria-label="Ops console">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
