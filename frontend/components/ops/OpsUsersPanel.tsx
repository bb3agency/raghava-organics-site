"use client";

import { useEffect, useState } from "react";
import { OpsCriticalOtpForm } from "@/components/ops/OpsCriticalOtpForm";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  deactivateOpsUserClient,
  listOpsUsersClient,
  type OpsUserListItem,
} from "@/lib/ops-client-api";

export function OpsUsersPanel() {
  const [users, setUsers] = useState<OpsUserListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listOpsUsersClient({ limit: 50 })
      .then((result) => setUsers(result.items))
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, []);

  return (
    <section className="grid gap-6">
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Active</th>
              <th className="p-2">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="p-2">{user.name}</td>
                <td className="p-2">{user.email}</td>
                <td className="p-2">{user.isActive ? "yes" : "no"}</td>
                <td className="p-2">{user.permissions.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OpsCriticalOtpForm
        actionType="user-deactivate"
        buttonLabel="Deactivate ops user"
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
        <label className="grid gap-1 text-sm">
          Ops user ID
          <input id="deactivate-user-id" className="h-10 rounded-md border px-3 text-sm" required />
        </label>
        <label className="grid gap-1 text-sm">
          Reason
          <textarea id="deactivate-reason" minLength={10} className="min-h-20 rounded-md border px-3 py-2 text-sm" required />
        </label>
      </OpsCriticalOtpForm>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
