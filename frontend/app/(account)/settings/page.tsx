"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuthStore } from "@/stores/auth";
import { getMyAddresses, createMyAddress, deleteMyAddress } from "@/lib/users-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";

interface AddressRow {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(10),
  line1: z.string().min(5),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(6),
});

type AddressFormData = z.infer<typeof addressSchema>;

export default function AccountSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        return;
      }
      try {
        const data = await getMyAddresses(accessToken);
        if (!cancelled) {
          setAddresses(data);
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

  const onSubmit = async (values: AddressFormData) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const newAddress = await createMyAddress(accessToken, {
        fullName: values.fullName,
        phone: values.phone,
        line1: values.line1,
        line2: values.line2 || null,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
      });
      setAddresses([...addresses, newAddress]);
      setShowAddForm(false);
      form.reset();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    if (!confirm("Are you sure you want to delete this address?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAddress(accessToken, id);
      setAddresses(addresses.filter(a => a.id !== id));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6">
       <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
             <h1 className="font-heading text-2xl font-semibold">Saved addresses</h1>
             {!showAddForm && (
               <Button onClick={() => setShowAddForm(true)} disabled={busy} size="sm">
                 Add New Address
               </Button>
             )}
          </div>
          
          {error ? <p className="text-sm text-destructive mb-4">{error}</p> : null}

          {showAddForm && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 bg-muted/30 p-4 rounded-md mb-6">
              <h2 className="font-medium text-sm">Add New Address</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                 <div>
                    <label className="text-xs font-medium block mb-1">Full Name</label>
                    <input {...form.register("fullName")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div>
                    <label className="text-xs font-medium block mb-1">Phone</label>
                    <input {...form.register("phone")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div className="sm:col-span-2">
                    <label className="text-xs font-medium block mb-1">Line 1</label>
                    <input {...form.register("line1")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div className="sm:col-span-2">
                    <label className="text-xs font-medium block mb-1">Line 2 (Optional)</label>
                    <input {...form.register("line2")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div>
                    <label className="text-xs font-medium block mb-1">City</label>
                    <input {...form.register("city")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div>
                    <label className="text-xs font-medium block mb-1">State</label>
                    <input {...form.register("state")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
                 <div>
                    <label className="text-xs font-medium block mb-1">Pincode</label>
                    <input {...form.register("pincode")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                 </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy}>Save Address</Button>
              </div>
            </form>
          )}

          <div className="grid gap-3">
            {!showAddForm && addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved addresses.</p>
            ) : (
              addresses.map((address) => (
                <article key={address.id} className="flex justify-between items-start rounded border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{address.fullName}</p>
                    <p className="text-muted-foreground">{address.phone}</p>
                    <p className="mt-1">{address.line1}</p>
                    {address.line2 && <p>{address.line2}</p>}
                    <p>
                      {address.city}, {address.state} - {address.pincode}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => handleDelete(address.id)}>
                     Delete
                  </Button>
                </article>
              ))
            )}
          </div>
       </div>
    </section>
  );
}
