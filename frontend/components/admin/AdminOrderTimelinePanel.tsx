"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import type { AdminOrderTimeline } from "@/lib/admin-api";
import { formatAdminDate, orderStatusTone } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";

interface AdminOrderTimelinePanelProps {
  orderId: string;
}

export function AdminOrderTimelinePanel({ orderId }: AdminOrderTimelinePanelProps) {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminOrderTimeline | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const timeline = await api<AdminOrderTimeline>(`/admin/orders/${orderId}/timeline`);
      setData(timeline);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const events = data?.timeline ?? [];

  return (
    <AdminSection
      title="Status timeline"
      description={
        data
          ? `Current status: ${data.currentStatus}`
          : "Order status history"
      }
      loading={loading}
      error={error}
      empty={!loading && !error && events.length === 0}
      emptyMessage="No status transitions recorded."
      actions={
        data ? (
          <AdminStatusBadge
            label={data.currentStatus}
            tone={orderStatusTone(data.currentStatus)}
          />
        ) : null
      }
    >
      {events.length > 0 ? (
        <ol className="relative border-l border-border pl-4">
          {events.map((event) => (
            <li key={event.id} className="mb-4 ml-2 last:mb-0">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-border bg-card" />
              <p className="text-sm font-medium">{event.toStatus}</p>
              {event.fromStatus ? (
                <p className="text-xs text-muted-foreground">
                  From {event.fromStatus}
                </p>
              ) : null}
              {event.note ? (
                <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatAdminDate(event.createdAt)}
                {event.triggeredBy ? ` · ${event.triggeredBy}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </AdminSection>
  );
}
