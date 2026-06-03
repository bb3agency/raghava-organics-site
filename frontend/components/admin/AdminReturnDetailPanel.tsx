"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { AdminLoadingBlock } from "@/components/admin/ui/admin-ui";
import { ensureArray, type AdminReturnRequestDetail } from "@/lib/admin-api";
import { formatAdminDate, returnStatusTone } from "@/lib/admin-format";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";

const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "PICKED_UP", "REFUNDED"];

interface AdminReturnDetailPanelProps {
  returnId: string;
}

export function AdminReturnDetailPanel({ returnId }: AdminReturnDetailPanelProps) {
  const api = useAuthenticatedApi();
  const [detail, setDetail] = useState<AdminReturnRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminReturnRequestDetail>(
        `/admin/return-requests/${returnId}`,
      );
      setDetail({ ...response, items: ensureArray(response.items) });
      setAdminNote(response.adminNote ?? "");
      setNextStatus(response.status);
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [api, returnId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpdate() {
    setSubmitting(true);
    setMessage(null);
    try {
      await api(`/admin/return-requests/${returnId}`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          status: nextStatus,
          adminNote: adminNote || undefined,
        }),
      });
      setMessage("Return request updated.");
      await load();
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <AdminLoadingBlock label="Loading return request…" />;
  }

  if (error && !detail) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground">Return request not found.</p>;
  }

  return (
    <div className="grid gap-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <AdminSection title={`Return ${detail.orderNumber}`}>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Customer:</span> {detail.customerName}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {detail.customerEmail}
          </p>
          <p>
            <span className="text-muted-foreground">Order:</span>{" "}
            <Link href={`/admin/orders/${detail.orderId}`} className="text-primary hover:underline">
              {detail.orderNumber}
            </Link>
          </p>
          <p>
            <span className="text-muted-foreground">Requested:</span>{" "}
            {formatAdminDate(detail.createdAt)}
          </p>
          <div>
            <AdminStatusBadge
              label={detail.status}
              tone={returnStatusTone(detail.status)}
            />
          </div>
        </div>
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Reason:</span> {detail.reason}
        </p>
      </AdminSection>

      <AdminSection
        title="Line items"
        empty={detail.items.length === 0}
        emptyMessage="No line items recorded."
      >
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Order item ID</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Item reason</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item, index) => (
                <tr key={`${item.orderItemId}-${index}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{item.orderItemId}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="Update status">
        <div className="grid max-w-md gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Status</span>
            <select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value)}
              className="h-10 rounded-md border border-border bg-background px-2"
            >
              {RETURN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Admin note</span>
            <textarea
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              className="min-h-24 rounded-md border border-border px-3 py-2"
            />
          </label>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={submitting}
            onClick={() => void handleUpdate()}
          >
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </AdminSection>
    </div>
  );
}
