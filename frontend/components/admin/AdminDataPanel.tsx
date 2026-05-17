"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { getApiErrorMessage } from "@/lib/error-messages";

interface AdminDataPanelProps {
  title: string;
  endpoint: string;
  emptyMessage: string;
}

export function AdminDataPanel({
  title,
  endpoint,
  emptyMessage,
}: AdminDataPanelProps) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await api<unknown>(endpoint);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
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
  }, [api, endpoint]);

  if (loading) {
    return (
      <section className="grid gap-3 rounded-lg border border-border p-4" aria-busy="true">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      </section>
    );
  }

  const hasRows =
    Array.isArray(data) ? data.length > 0 : Boolean(data && typeof data === "object");

  if (!hasRows) {
    return (
      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <pre className="max-h-[360px] overflow-auto rounded-md bg-muted/40 p-3 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
