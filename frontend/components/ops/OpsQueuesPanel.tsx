"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  getOpsDlqSummaryClient,
  getOpsQueuesBoardUrl,
  type OpsDlqSummary,
} from "@/lib/ops-client-api";

export function OpsQueuesPanel() {
  const [summary, setSummary] = useState<OpsDlqSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOpsDlqSummaryClient()
      .then(setSummary)
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, []);

  return (
    <section className="grid gap-4">
      <a
        href={getOpsQueuesBoardUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Open Bull Board (new tab)
      </a>
      {summary ? (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">DLQ total: {summary.total}</p>
          {summary.total > 0 ? (
            <ul className="mt-2 grid gap-1">
              {Object.entries(summary.bySourceQueue ?? {}).map(([queue, count]) => (
                <li key={queue}>
                  {queue}: {count}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted-foreground">No dead-letter jobs in the current window.</p>
          )}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
