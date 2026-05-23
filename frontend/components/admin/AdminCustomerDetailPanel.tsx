"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import { hasAdminPermission, ADMIN_PERMISSIONS } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth";
import { createIdempotencyKey } from "@/lib/idempotency";

interface AdminCustomerDetailPanelProps {
  customerId: string;
}

export function AdminCustomerDetailPanel({ customerId }: AdminCustomerDetailPanelProps) {
  const api = useAuthenticatedApi();
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<unknown>(null);
  const [orders, setOrders] = useState<unknown>(null);
  const [notes, setNotes] = useState<unknown>(null);
  const [noteText, setNoteText] = useState("");
  const [banReason, setBanReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api(`/admin/users/${customerId}`),
      api(`/admin/users/${customerId}/orders?page=1&limit=20`),
      api(`/admin/users/${customerId}/notes`),
    ])
      .then(([nextProfile, nextOrders, nextNotes]) => {
        setProfile(nextProfile);
        setOrders(nextOrders);
        setNotes(nextNotes);
      })
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, [api, customerId]);

  const canWrite = hasAdminPermission(user, ADMIN_PERMISSIONS.usersWrite);

  return (
    <section className="grid gap-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <pre className="max-h-72 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(profile, null, 2)}</pre>
      <div>
        <h3 className="font-medium">Orders tab</h3>
        <pre className="max-h-48 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(orders, null, 2)}</pre>
      </div>
      <div>
        <h3 className="font-medium">Admin notes</h3>
        <pre className="max-h-48 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(notes, null, 2)}</pre>
        {canWrite ? (
          <form
            className="mt-3 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void api(`/admin/users/${customerId}/notes`, {
                method: "POST",
                idempotencyKey: createIdempotencyKey(),
                body: JSON.stringify({ note: noteText }),
              })
                .then(() => setMessage("Note added."))
                .catch((err) => setError(getApiErrorMessageWithHint(err)));
            }}
          >
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              className="min-h-20 rounded-md border px-3 py-2 text-sm"
              required
            />
            <button type="submit" className="h-10 w-fit rounded-md bg-primary px-4 text-sm text-primary-foreground">
              Add note
            </button>
          </form>
        ) : null}
      </div>
      {canWrite ? (
        <div className="grid gap-2 rounded-md border p-4">
          <h3 className="font-medium">Ban / unban</h3>
          <textarea
            value={banReason}
            onChange={(event) => setBanReason(event.target.value)}
            placeholder="Ban reason (required for ban)"
            className="min-h-20 rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-10 rounded-md bg-destructive px-4 text-sm text-destructive-foreground"
              onClick={() => {
                void api(`/admin/users/${customerId}/ban`, {
                  method: "PATCH",
                  idempotencyKey: createIdempotencyKey(),
                  body: JSON.stringify({ reason: banReason }),
                })
                  .then(() => setMessage("Customer banned."))
                  .catch((err) => setError(getApiErrorMessageWithHint(err)));
              }}
            >
              Ban customer
            </button>
            <button
              type="button"
              className="h-10 rounded-md border px-4 text-sm"
              onClick={() => {
                void api(`/admin/users/${customerId}/ban`, {
                  method: "DELETE",
                  idempotencyKey: createIdempotencyKey(),
                })
                  .then(() => setMessage("Customer unbanned."))
                  .catch((err) => setError(getApiErrorMessageWithHint(err)));
              }}
            >
              Unban
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
