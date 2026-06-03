"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminReplayActions } from "@/components/admin/AdminReplayActions";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import {
  buildAdminQuery,
  coercePaginatedResponse,
  type AdminReconciliationIssue,
  readPaginatedItems,
  type PaginatedResponse,
} from "@/lib/admin-api";
import { formatAdminDate } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAuthStore } from "@/stores/auth";
import { resolveApiBaseUrl } from "@/lib/api-base";

interface OutboxDeadLetter {
  id: string;
  queueName: string;
  jobName: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

interface InboxFailure {
  id: string;
  provider: string;
  eventKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function AdminReliabilityPanels() {
  return (
    <div className="grid gap-6">
      <header className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-heading text-xl font-semibold">Reliability</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reconciliation issues, dead-letter queues, and inbox failures.
        </p>
        <div className="mt-3">
          <RevenueCsvDownloadButton />
        </div>
      </header>
      <ReconciliationIssuesPanel />
      <OutboxDeadLetterPanel />
      <InboxFailuresPanel />
    </div>
  );
}

function RevenueCsvDownloadButton() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const base = resolveApiBaseUrl();
      if (!base) throw new Error("API base URL not configured");
      const response = await fetch(`${base}/admin/analytics/revenue/export`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "analytics-revenue.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void download()}>
        {loading ? "Downloading…" : "Download revenue CSV"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ReconciliationIssuesPanel() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<AdminReconciliationIssue> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<AdminReconciliationIssue>>(
        `/admin/analytics/reconciliation-issues${buildAdminQuery({ page, limit: 20 })}`,
      );
      setData(coercePaginatedResponse(response));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = readPaginatedItems(data);

  return (
    <AdminSection
      title="Reconciliation issues"
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No reconciliation issues."
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Ref</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Detected</th>
                </tr>
              </thead>
              <tbody>
                {items.map((issue) => (
                  <tr key={issue.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs">{issue.issueType}</td>
                    <td className="px-3 py-2 font-mono text-xs">{issue.aggregateRef}</td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge label={issue.severity} tone="warning" />
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge
                        label={issue.isResolved ? "Resolved" : "Open"}
                        tone={issue.isResolved ? "success" : "destructive"}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAdminDate(issue.detectedAt)}
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

function OutboxDeadLetterPanel() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<OutboxDeadLetter> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<OutboxDeadLetter>>(
        `/admin/analytics/outbox-dead-letter${buildAdminQuery({ page, limit: 20 })}`,
      );
      setData(coercePaginatedResponse(response));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = readPaginatedItems(data);

  return (
    <AdminSection
      title="Outbox dead letters"
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No outbox dead-letter messages."
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Queue</th>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs">{item.queueName}</td>
                    <td className="px-3 py-2 text-xs">{item.jobName}</td>
                    <td className="px-3 py-2">{item.attemptCount}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAdminDate(item.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <AdminReplayActions
                        previewEndpoint={`/admin/analytics/outbox-dead-letter/${item.id}/replay-preview`}
                        replayEndpoint={`/admin/analytics/outbox-dead-letter/${item.id}/replay`}
                        onComplete={() => void load()}
                      />
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

function InboxFailuresPanel() {
  const api = useAuthenticatedApi();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<InboxFailure> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<PaginatedResponse<InboxFailure>>(
        `/admin/analytics/inbox-failures${buildAdminQuery({ page, limit: 20 })}`,
      );
      setData(coercePaginatedResponse(response));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = readPaginatedItems(data);

  return (
    <AdminSection
      title="Inbox failures"
      loading={loading}
      error={error}
      empty={!loading && !error && items.length === 0}
      emptyMessage="No inbox failures."
    >
      {data ? (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{item.provider}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.eventKey}</td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge label={item.status} tone="destructive" />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAdminDate(item.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <AdminReplayActions
                        previewEndpoint={`/admin/analytics/inbox-failures/${item.id}/replay-preview`}
                        replayEndpoint={`/admin/analytics/inbox-failures/${item.id}/replay`}
                        onComplete={() => void load()}
                      />
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
