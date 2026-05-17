"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { getMyAddresses } from "@/lib/users-api";
import { getApiErrorMessage } from "@/lib/error-messages";

interface AddressRow {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export default function AccountSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        return;
      }
      try {
        const data = await getMyAddresses(accessToken);
        if (!cancelled) {
          setAddresses(data as AddressRow[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h1 className="font-heading text-2xl font-semibold">Saved addresses</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved addresses.</p>
      ) : (
        addresses.map((address) => (
          <article key={address.id} className="rounded border border-border p-3 text-sm">
            <p className="font-medium">{address.fullName}</p>
            <p>{address.phone}</p>
            <p>{address.line1}</p>
            <p>
              {address.city}, {address.state} - {address.pincode}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
