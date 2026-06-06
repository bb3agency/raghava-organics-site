"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Settings,
  BellRing
} from "lucide-react";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";
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
    label: "Email Delivery",
    description: "Send transaction updates, digital receipts, and OTPs via secure email.",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    id: "sms",
    label: "SMS Gateway",
    description: "Deliver instant security OTPs and order status SMS messages to mobile devices.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business",
    description: "Send updates and verification codes directly via automated WhatsApp notifications.",
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
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.settingsWrite);
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
    if (!canWrite) return;
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
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setSaveError(getApiErrorMessageWithHint(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/60" />
        <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">Failed to load notification settings</p>
          <p>{fetchError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium text-foreground">Notification Channels</h3>
        <p className="text-sm text-muted-foreground">
          Configure preferred global dispatch pathways and customized template routing rules.
        </p>
      </div>

      {/* Primary Channel Card */}
      <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BellRing className="h-4 w-4 text-primary" />
            Primary Gateway Configuration
          </h4>
          <span className="self-start sm:self-auto rounded-full bg-zinc-900/10 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
            Active Fallback: <span className="capitalize">{savedChannel}</span>
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground max-w-xl">
          This gateway handles high-priority system alerts and accounts for customer communication if a specific event template does not have override routing.
        </p>

        <div className="grid gap-4 md:grid-cols-3 mt-3">
          {CHANNELS.map((ch) => {
            const isSelected = selected === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelected(ch.id)}
                className={`flex flex-col items-start gap-3 rounded-lg border p-4.5 text-left transition-all hover:bg-background cursor-pointer ${
                  isSelected
                    ? "border-primary bg-background ring-2 ring-primary/10 shadow-sm"
                    : "border-border bg-background/50 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <div className={`rounded-lg p-2 ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {ch.icon}
                </div>
                <div className="space-y-1">
                  <span className={`text-sm font-semibold flex items-center gap-1.5 ${isSelected ? "text-foreground" : "text-muted-foreground/90"}`}>
                    {ch.label}
                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground/80">{ch.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Override Routing Card */}
      <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-4">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Settings className="h-4 w-4 text-primary" />
          Template Routing Overrides
        </h4>
        <p className="text-xs text-muted-foreground max-w-xl">
          Fine-tune the notification delivery path for individual business events. Setting a template to &apos;Default&apos; falls back to your primary gateway selection above.
        </p>

        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Event Name / Template ID</th>
                <th className="px-4 py-3 font-semibold text-right">Preferred Gateway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {NOTIFICATION_TEMPLATES.map((template) => (
                <tr key={template} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground/95">
                    {template.replace(/([A-Z])/g, ' $1').trim()}
                    <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                      {template}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <select
                      className="h-8 rounded-lg border border-border bg-background px-3 text-xs text-foreground font-medium transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden cursor-pointer"
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
                      <option value="">Default (Use Primary)</option>
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

      {saveError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-start gap-2.5 rounded-lg border border-zinc-900/20 bg-zinc-900/10 p-3.5 text-xs text-zinc-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Notification settings updated successfully.</span>
        </div>
      )}

      {/* Submit Action Bar */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !isDirty || !canWrite}
            title={!canWrite ? "Requires settings:write permission" : undefined}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/95 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              "Save Channel Configurations"
            )}
          </button>

          {isDirty && !saving && (
            <span className="text-xs font-medium text-amber-600 ml-2">
              You have unsaved changes
            </span>
          )}
        </div>

        {!isDirty && !saving && (
          <span className="text-xs text-muted-foreground">
            Configuration is up to date
          </span>
        )}
      </div>
    </div>
  );
}

