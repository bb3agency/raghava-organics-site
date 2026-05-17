import type { ReactNode } from "react";
import Link from "next/link";

interface OpsLayoutProps {
  children: ReactNode;
}

export default function OpsLayout({ children }: OpsLayoutProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Ops control plane
        </p>
        <h1 className="font-heading mt-2 text-3xl font-semibold">Operations</h1>
      </header>
      <nav className="mb-8 flex flex-wrap gap-4 text-sm" aria-label="Ops">
        <Link href="/ops">Session</Link>
        <Link href="/ops/load-shed">Load shed</Link>
        <Link href="/ops/approvals">Approvals</Link>
        <Link href="/ops/config">Config</Link>
        <Link href="/ops/audit">Audit</Link>
        <Link href="/ops/invites">Invites</Link>
        <Link href="/ops/setup">Setup</Link>
        <Link href="/ops/metrics">Metrics</Link>
      </nav>
      {children}
    </div>
  );
}
