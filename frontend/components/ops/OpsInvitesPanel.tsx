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
} from "@/components/ops/ui/ops-ui";
import { Button } from "@/components/ui/button";
import { formatOpsDateTime, formatOpsRelativeExpiry } from "@/lib/ops-format";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { inviteStatusTone } from "@/lib/ops-status-maps";
import {
  cleanupExpiredOpsInvitesClient,
  createOpsInviteClient,
  listOpsInvitesClient,
  revokeOpsInviteClient,
  type OpsInviteListItem,
} from "@/lib/ops-client-api";

const REVOKABLE_STATUSES = new Set<OpsInviteListItem["status"]>(["CREATED", "EMAIL_SENT"]);

export function OpsInvitesPanel() {
  const canWrite = useOpsCanWrite();
  const [items, setItems] = useState<OpsInviteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);

  async function reload() {
    const list = await listOpsInvitesClient({ limit: 50 });
    setItems(list.items);
  }

  useEffect(() => {
    let cancelled = false;
    void listOpsInvitesClient({ limit: 50 })
      .then((list) => {
        if (!cancelled) {
          setItems(list.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getApiErrorMessageWithHint(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const result = await createOpsInviteClient({
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        setupBaseUrl: String(formData.get("setupBaseUrl") ?? ""),
        ipAllowlist: String(formData.get("ipAllowlist") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setMessage(
        `Invite created — expires ${formatOpsDateTime(result.expiresAt)}. Setup URL was emailed to the invitee.`,
      );
      await reload();
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    }
  }

  if (loading) {
    return <OpsLoadingBlock label="Loading invites…" />;
  }

  return (
    <div className="grid gap-6">
      {message ? <OpsAlert tone="success">{message}</OpsAlert> : null}
      {error ? <OpsAlert tone="error">{error}</OpsAlert> : null}

      {canWrite ? (
        <OpsCard>
          <OpsCardHeader
            title="Create invite"
            description="setupBaseUrl must be the storefront origin only (no /ops/setup path). New ops users always receive OPS_READ + OPS_WRITE."
          />
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <OpsField label="Email" htmlFor="invite-email">
              <OpsInput id="invite-email" name="email" type="email" required />
            </OpsField>
            <OpsField label="Name" htmlFor="invite-name">
              <OpsInput id="invite-name" name="name" required />
            </OpsField>
            <OpsField label="Setup base URL" htmlFor="invite-url" className="sm:col-span-2">
              <OpsInput
                id="invite-url"
                name="setupBaseUrl"
                placeholder="https://raghavaorganics.com"
                required
              />
            </OpsField>
            <OpsField label="IP allowlist" htmlFor="invite-ip" hint="Optional, comma-separated CIDRs">
              <OpsInput id="invite-ip" name="ipAllowlist" placeholder="203.0.113.10/32" />
            </OpsField>
            <div className="sm:col-span-2">
              <Button type="submit">Send invite</Button>
            </div>
          </form>
        </OpsCard>
      ) : (
        <OpsAlert tone="warning">Read-only — creating invites requires ops:write.</OpsAlert>
      )}

      <OpsCard>
        <OpsCardHeader
          title="Invite queue"
          description={`${items.length} recent invites`}
          actions={
            canWrite ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void cleanupExpiredOpsInvitesClient()
                    .then((result) => setMessage(`Cleaned ${result.cleaned} expired invites.`))
                    .catch((err) => setError(getApiErrorMessageWithHint(err)))
                    .then(() => reload());
                }}
              >
                Cleanup expired
              </Button>
            ) : null
          }
        />
        <OpsDataTable
          rows={items}
          rowKey={(row) => row.id}
          emptyTitle="No invites"
          emptyDescription="Create an invite to onboard a new operator."
          columns={[
            { key: "email", header: "Email", cell: (row) => row.inviteEmail },
            { key: "name", header: "Name", cell: (row) => row.inviteName },
            {
              key: "status",
              header: "Status",
              cell: (row) => <OpsBadge tone={inviteStatusTone(row.status)}>{row.status}</OpsBadge>,
            },
            {
              key: "expires",
              header: "Expires",
              cell: (row) => (
                <span className="text-muted-foreground">
                  {formatOpsRelativeExpiry(row.expiresAt)}
                </span>
              ),
            },
            {
              key: "id",
              header: "Invite ID",
              cell: (row) => <code className="text-xs text-muted-foreground">{row.id}</code>,
            },
            ...(canWrite
              ? [
                  {
                    key: "actions",
                    header: "Actions",
                    cell: (row: OpsInviteListItem) =>
                      REVOKABLE_STATUSES.has(row.status) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRevokeInviteId(row.id);
                            setMessage(null);
                            setError(null);
                          }}
                        >
                          Revoke…
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </OpsCard>

      {canWrite && revokeInviteId ? (
        <OpsCriticalOtpForm
          actionType="invite-revoke"
          title="Revoke invite"
          description={`Cancels invite ${revokeInviteId} before it is consumed.`}
          buttonLabel="Confirm revoke"
          variant="danger"
          onExecute={async ({ challengeId, otpCode }) => {
            await revokeOpsInviteClient({ inviteId: revokeInviteId, challengeId, otpCode });
            setRevokeInviteId(null);
            setMessage("Invite revoked.");
            await reload();
          }}
        >
          <OpsField label="Invite ID" htmlFor="revoke-invite-id">
            <OpsInput
              id="revoke-invite-id"
              value={revokeInviteId}
              readOnly
              className="font-mono text-xs"
            />
          </OpsField>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeInviteId(null)}>
            Cancel revoke
          </Button>
        </OpsCriticalOtpForm>
      ) : null}
    </div>
  );
}
