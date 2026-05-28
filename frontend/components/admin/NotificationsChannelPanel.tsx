"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, MessageCircle, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { createIdempotencyKey } from "@/lib/idempotency";
import { getApiErrorMessage, getApiErrorMessageWithHint } from "@/lib/error-messages";

type Channel = "email" | "sms" | "whatsapp";

interface NotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
}

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

function detectChannel(settings: NotificationSettings): Channel {
  if (settings.smsEnabled && !settings.emailEnabled) return "sms";
  if (settings.whatsappEnabled && !settings.emailEnabled) return "whatsapp";
  return "email";
}

function channelToPayload(channel: Channel): NotificationSettings {
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
  const [current, setCurrent] = useState<Channel>("email");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setFetchError(null);
        const res = await api<NotificationSettings>("/admin/settings/notifications");
        if (!cancelled) {
          const ch = detectChannel(res);
          setSelected(ch);
          setCurrent(ch);
        }
      } catch (err) {
        if (!cancelled) setFetchError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [api]);

  async function save() {
    try {
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      await api("/admin/settings/notifications", {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify(channelToPayload(selected)),
      });
      setCurrent(selected);
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
        <h2 className="font-heading text-lg font-semibold">Primary notification channel</h2>
        <div className="h-32 animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  if (fetchError) {
    return (
      <section className="grid gap-4 rounded-lg border border-border p-5">
        <h2 className="font-heading text-lg font-semibold">Primary notification channel</h2>
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {fetchError}
        </p>
      </section>
    );
  }

  const isDirty = selected !== current;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Primary notification channel</h2>
        <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
          Active: <span className="capitalize text-foreground">{current}</span>
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Choose how customers receive OTPs and order notifications. Only one channel is active at a time.
      </p>

      <div className="grid gap-3">
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
              <span
                className={[
                  "mt-0.5 shrink-0",
                  isSelected ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                {ch.icon}
              </span>
              <span className="grid gap-0.5">
                <span className="flex items-center gap-2 font-medium text-sm">
                  {ch.label}
                  {isSelected && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{ch.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !isDirty}
          className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save channel"
          )}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs text-muted-foreground">No unsaved changes</span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        )}
      </div>
    </section>
  );
}
