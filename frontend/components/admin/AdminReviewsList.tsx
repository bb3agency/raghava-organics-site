"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import {
  buildAdminQuery,
  coercePaginatedResponse,
  type AdminReviewListItem,
  readPaginatedItems,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatAdminDate, reviewApprovalTone } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";

const PAGE_SIZE = 20;

export function AdminReviewsList() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [approvedFilter, setApprovedFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<AdminReviewListItem> | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<AdminReviewListItem>>(
        `/admin/reviews${buildAdminQuery({
          page,
          limit: PAGE_SIZE,
          approved:
            approvedFilter === "" ? undefined : approvedFilter === "true",
        })}`,
      );
      setData(coercePaginatedResponse(response));
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, page, approvedFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [approvedFilter]);

  async function moderate(reviewId: string, approved: boolean) {
    setActionId(reviewId);
    try {
      await api(`/admin/reviews/${reviewId}/moderate`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ approved }),
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setActionId(null);
    }
  }

  async function remove(reviewId: string) {
    if (!window.confirm("Permanently delete this review?")) {
      return;
    }
    setActionId(reviewId);
    try {
      await api(`/admin/reviews/${reviewId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setActionId(null);
    }
  }

  const items = readPaginatedItems(data);

  return (
    <AdminSection
      title="Review moderation"
      description="Approve or reject customer product reviews."
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No reviews in the queue."
      actions={
        <select
          value={approvedFilter}
          onChange={(event) => setApprovedFilter(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Filter by approval"
        >
          <option value="">All reviews</option>
          <option value="false">Pending</option>
          <option value="true">Approved</option>
        </select>
      }
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Author</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((review) => (
                  <tr key={review.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <p>
                        {review.author.firstName} {review.author.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatAdminDate(review.createdAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2">{review.rating}/5</td>
                    <td className="max-w-xs px-3 py-2 text-xs">
                      {review.body ?? <span className="text-muted-foreground">No text</span>}
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge
                        label={review.approved ? "Approved" : "Pending"}
                        tone={reviewApprovalTone(review.approved)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {!review.approved ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={actionId === review.id}
                            onClick={() => void moderate(review.id, true)}
                          >
                            Approve
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={actionId === review.id}
                            onClick={() => void moderate(review.id, false)}
                          >
                            Reject
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={actionId === review.id}
                          onClick={() => void remove(review.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination meta={data.meta} onPageChange={setPage} />
        </>
      ) : null}
    </AdminSection>
  );
}
