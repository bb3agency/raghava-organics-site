"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { getOpsAuditLogsClient, type OpsAuditRecord } from "@/lib/ops-client-api";

export function OpsAuditPanel() {
  const [items, setItems] = useState<OpsAuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOpsAuditLogsClient({ limit: 50 })
      .then((result) => setItems(result.items))
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, []);

  return (
    <section className="grid gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">When</th>
              <th className="p-2">Action</th>
              <th className="p-2">Status</th>
              <th className="p-2">Path</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="p-2">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="p-2">{item.actionType ?? "—"}</td>
                <td className="p-2">{item.actionStatus}</td>
                <td className="p-2">
                  {item.method} {item.requestPath}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
