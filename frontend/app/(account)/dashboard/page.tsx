"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { getCurrentUser } from "@/lib/users-api";
import { getApiErrorMessage } from "@/lib/error-messages";

export default function AccountDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState<string | null>(user?.firstName ?? null);
  const [email, setEmail] = useState<string | null>(user?.email ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.firstName) {
      setName(user.firstName);
      setEmail(user.email ?? null);
      return;
    }
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        return;
      }
      try {
        const me = await getCurrentUser(accessToken);
        if (!cancelled) {
          setName(me.firstName);
          setEmail(me.email);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user]);

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <h1 className="font-heading text-xl font-semibold sm:text-2xl">Account dashboard</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <p className="font-medium">{name ?? "Customer"}</p>
          {email ? <p className="text-sm">{email}</p> : null}
        </>
      )}
      <nav className="grid gap-2 border-t border-border pt-4 text-sm">
        <Link href="/orders" className="underline">
          Order history
        </Link>
        <Link href="/settings" className="underline">
          Profile &amp; saved addresses
        </Link>
      </nav>
    </section>
  );
}
