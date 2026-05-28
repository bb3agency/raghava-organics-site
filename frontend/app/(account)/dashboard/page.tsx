"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { getCurrentUser } from "@/lib/users-api";
import { getApiErrorMessage } from "@/lib/error-messages";

export default function AccountDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [accessToken]);

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h1 className="font-heading text-2xl font-semibold">Account dashboard</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <p className="font-medium">{name ?? "Customer"}</p>
          <p className="text-sm">{email}</p>
        </>
      )}
    </section>
  );
}
