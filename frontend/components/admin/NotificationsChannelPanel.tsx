"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
} from "lucide-react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import type { AdminNotificationSettings } from "@/lib/admin-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessage, getApiErrorMessageWithHint } from "@/lib/error-messages";

type Channel = "email" | "sms" | "whatsapp";

const NOTIFICATION_TEMPLATES = [
  "OrderConfirmed",
  "PaymentFailed",
  "OrderShipped",
  "OutForDelivery",
  "OrderDelivered",
  "OrderCancelled",
  "LowStockAlert",
  "OtpVerification",
  "CustomerOtpVerification",
] as const;

const CHANNELS: { id: Channel; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "email",
    label: "Email",
    description: "Order confirmations, OTPs, and shipping updates sent to the customer's email address.",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    id: "sms",
    label: "SMS",
    description: "OTPs and order alerts sent as text messages to the customer's mobile number.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "OTPs and order updates delivered to the customer's WhatsApp.",
    icon: <MessageCircle className="h-5 w-5" />,
  },
];

function detectChannel(settings: Pick<AdminNotificationSettings, "emailEnabled" | "smsEnabled" | "whatsappEnabled">): Channel {
  if (settings.smsEnabled && !settings.emailEnabled) return "sms";
  if (settings.whatsappEnabled && !settings.emailEnabled) return "whatsapp";
  return "email";
}

function channelToFlags(channel: Channel) {
  return {
    emailEnabled: channel === "email",
    smsEnabled: channel === "sms",
    whatsappEnabled: channel === "whatsapp",
  };
}

export function NotificationsChannelPanel() {
  const api = useAuthenticatedApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Channel>("email");
  const [savedChannel, setSavedChannel] = useState<Channel>("email");
  const [primaryChannels, setPrimaryChannels] = useState<
    Record<string, "EMAIL" | "SMS" | "WHATSAPP">
  >({});
  const [savedPrimaryChannels, setSavedPrimaryChannels] = useState<
    Record<string, "EMAIL" | "SMS" | "WHATSAPP">
  >({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setFetchError(null);
        const res = await api<AdminNotificationSettings>("/admin/settings/notifications");
        if (!cancelled) {
          const ch = detectChannel(res);
          setSelected(ch);
          setSavedChannel(ch);
          setPrimaryChannels(res.primaryChannels ?? {});
          setSavedPrimaryChannels(res.primaryChannels ?? {});
        }
      } catch (err) {
        if (!cancelled) setFetchError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const channelDirty = selected !== savedChannel;
  const routingDirty =
    JSON.stringify(primaryChannels) !== JSON.stringify(savedPrimaryChannels);
  const isDirty = channelDirty || routingDirty;

  async function save() {
    try {
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      await api("/admin/settings/notifications", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          ...channelToFlags(selected),
          primaryChannels,
        }),
      });
      setSavedChannel(selected);
      setSavedPrimaryChannels(primaryChannels);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(getApiErrorMessageWithHint(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="grid gap-4 rounded-lg border border-border p-5">
        <h2 className="font-heading text-lg font-semibold">Notifications</h2>
        <div className="h-32 animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  if (fetchError) {
    return (
      <section className="grid gap-4 rounded-lg border border-border p-5">
        <h2 className="font-heading text-lg font-semibold">Notifications</h2>
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {fetchError}
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-6 rounded-lg border border-border p-5">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold">Primary notification channel</h2>
          <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
            Active: <span className="capitalize text-foreground">{savedChannel}</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Default channel for OTPs when a template has no explicit routing.
        </p>
        <div className="mt-3 grid gap-3">
          {CHANNELS.map((ch) => {
            const isSelected = selected === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelected(ch.id)}
                className={[
                  "flex items-start gap-4 rounded-lg border px-4 py-3 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
                ].join(" ")}
              >
                <span className={isSelected ? "mt-0.5 text-primary" : "mt-0.5 text-muted-foreground"}>
                  {ch.icon}
                </span>
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {ch.label}
                    {isSelected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{ch.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-medium">Template routing</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Override the delivery channel per notification template.
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Channel</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TEMPLATES.map((template) => (
                <tr key={template} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{template}</td>
                  <td className="px-3 py-2">
                    <select
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      value={primaryChannels[template] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value as "EMAIL" | "SMS" | "WHATSAPP" | "";
                        setPrimaryChannels((current) => {
                          const next = { ...current };
                          if (!value) {
                            delete next[template];
                          } else {
                            next[template] = value;
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">Default</option>
                      <option value="EMAIL">Email</option>
                      <option value="SMS">SMS</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save notification settings"
          )}
        </button>
        {!isDirty && !saving ? (
          <span className="text-xs text-muted-foreground">No unsaved changes</span>
        ) : null}
        {saved ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : null}
        {saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : null}
      </div>
    </section>
  );
}
