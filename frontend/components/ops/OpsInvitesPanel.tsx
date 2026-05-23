"use client";

import { useEffect, useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  cleanupExpiredOpsInvitesClient,
  createOpsInviteClient,
  listOpsInvitesClient,
  revokeOpsInviteClient,
  type OpsInviteListItem,
} from "@/lib/ops-client-api";

export function OpsInvitesPanel() {
  const [items, setItems] = useState<OpsInviteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const list = await listOpsInvitesClient({ limit: 50 });
    setItems(list.items);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInvites() {
      try {
        const list = await listOpsInvitesClient({ limit: 50 });
        if (!cancelled) {
          setItems(list.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessageWithHint(err));
        }
      }
    }
    void loadInvites();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const permissions = String(formData.get("permissions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .map((value) => value.toUpperCase().replace("OPS:", "OPS_"))
      .filter((value): value is "OPS_READ" | "OPS_WRITE" => value === "OPS_READ" || value === "OPS_WRITE");
    try {
      const result = await createOpsInviteClient({
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        setupBaseUrl: String(formData.get("setupBaseUrl") ?? ""),
        permissions,
        ipAllowlist: String(formData.get("ipAllowlist") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setMessage(`Invite created. Setup URL: ${result.setupUrl}`);
      await reload();
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    }
  }

  return (
    <section className="grid gap-6">
      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Create invite</h3>
        <input name="email" type="email" placeholder="Email" className="h-10 rounded-md border px-3 text-sm" required />
        <input name="name" placeholder="Name" className="h-10 rounded-md border px-3 text-sm" required />
        <input
          name="setupBaseUrl"
          placeholder="https://storefront.example.com"
          className="h-10 rounded-md border px-3 text-sm"
          required
        />
        <input
          name="permissions"
          defaultValue="OPS_READ,OPS_WRITE"
          placeholder="OPS_READ,OPS_WRITE"
          className="h-10 rounded-md border px-3 text-sm"
          required
        />
        <input
          name="ipAllowlist"
          placeholder="203.0.113.10/32 (optional)"
          className="h-10 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Create invite
        </button>
      </form>

      <button
        type="button"
        className="h-10 w-fit rounded-md border px-4 text-sm"
        onClick={() => {
          void cleanupExpiredOpsInvitesClient()
            .then((result) => setMessage(`Cleaned ${result.cleaned} expired invites.`))
            .catch((err) => setError(getApiErrorMessageWithHint(err)));
        }}
      >
        Cleanup expired invites
      </button>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Email</th>
              <th className="p-2">Status</th>
              <th className="p-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="p-2">{item.inviteEmail}</td>
                <td className="p-2">{item.status}</td>
                <td className="p-2">{new Date(item.expiresAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OpsCriticalOtpForm
        actionType="invite-revoke"
        buttonLabel="Revoke invite"
        onExecute={async ({ challengeId, otpCode }) => {
          const inviteId = String(
            (document.getElementById("revoke-invite-id") as HTMLInputElement | null)?.value ?? "",
          ).trim();
          await revokeOpsInviteClient({ inviteId, challengeId, otpCode });
          await reload();
        }}
      >
        <label className="grid gap-1 text-sm">
          Invite ID to revoke
          <input id="revoke-invite-id" className="h-10 rounded-md border px-3 text-sm" required />
        </label>
      </OpsCriticalOtpForm>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
