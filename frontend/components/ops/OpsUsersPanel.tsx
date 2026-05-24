"use client";

import { useEffect, useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { useOpsCanWrite } from "@/components/ops/OpsSessionProvider";
import {
  OpsAlert,
  OpsBadge,
  OpsCard,
  OpsCardHeader,
  OpsDataTable,
  OpsField,
  OpsInput,
  OpsLoadingBlock,
  OpsTextarea,
} from "@/components/ops/ui/ops-ui";
import { formatOpsDateTime } from "@/lib/ops-format";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  deactivateOpsUserClient,
  listOpsUsersClient,
  type OpsUserListItem,
} from "@/lib/ops-client-api";

export function OpsUsersPanel() {
  const canWrite = useOpsCanWrite();
  const [users, setUsers] = useState<OpsUserListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listOpsUsersClient({ limit: 50 })
      .then((result) => setUsers(result.items))
      .catch((err) => setError(getApiErrorMessageWithHint(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <OpsLoadingBlock label="Loading operators…" />;
  }

  return (
    <div className="grid gap-6">
      {error ? <OpsAlert tone="error">{error}</OpsAlert> : null}

      <OpsCard>
        <OpsCardHeader title="Operators" description={`${users.length} accounts`} />
        <OpsDataTable
          rows={users}
          rowKey={(row) => row.id}
          emptyTitle="No operators"
          columns={[
            { key: "name", header: "Name", cell: (row) => row.name },
            { key: "email", header: "Email", cell: (row) => row.email },
            {
              key: "active",
              header: "Status",
              cell: (row) => (
                <OpsBadge tone={row.isActive ? "success" : "muted"}>
                  {row.isActive ? "Active" : "Inactive"}
                </OpsBadge>
              ),
            },
            {
              key: "perms",
              header: "Permissions",
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.permissions.map((p) => (
                    <OpsBadge key={p} tone="info">
                      {p}
                    </OpsBadge>
                  ))}
                </div>
              ),
            },
            {
              key: "login",
              header: "Last login",
              cell: (row) => formatOpsDateTime(row.lastLoginAt),
            },
            {
              key: "id",
              header: "ID",
              cell: (row) => <code className="text-xs text-muted-foreground">{row.id}</code>,
            },
          ]}
        />
      </OpsCard>

      {canWrite ? (
        <OpsCriticalOtpForm
          actionType="user-deactivate"
          title="Deactivate operator"
          description="Irreversible for active sessions — user must be re-invited to return."
          buttonLabel="Deactivate account"
          variant="danger"
          onExecute={async ({ challengeId, otpCode }) => {
            const opsUserId = String(
              (document.getElementById("deactivate-user-id") as HTMLInputElement | null)?.value ?? "",
            ).trim();
            const reason = String(
              (document.getElementById("deactivate-reason") as HTMLTextAreaElement | null)?.value ?? "",
            ).trim();
            await deactivateOpsUserClient({ opsUserId, reason, challengeId, otpCode });
          }}
        >
          <OpsField label="Ops user ID" htmlFor="deactivate-user-id">
            <OpsInput id="deactivate-user-id" required className="font-mono text-xs" />
          </OpsField>
          <OpsField label="Reason" htmlFor="deactivate-reason" hint="Minimum 10 characters">
            <OpsTextarea id="deactivate-reason" minLength={10} required />
          </OpsField>
        </OpsCriticalOtpForm>
      ) : (
        <OpsAlert tone="warning">Read-only — deactivation requires ops:write.</OpsAlert>
      )}
    </div>
  );
}
