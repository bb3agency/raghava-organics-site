import type { OpsConfigOverview, OpsStoredConfig } from "@/lib/ops-client-api";

export type OpsConfigDomain = OpsConfigOverview["domains"][number]["domain"];

export interface OpsConfigFieldDefinition {
  key: string;
  domain: OpsConfigDomain;
  label: string;
  hint?: string;
  inputKind: "text" | "secret" | "boolean" | "select";
  options?: Array<{ value: string; label: string }>;
  requiresRestart: boolean;
  present: boolean;
  storedMasked?: string;
}

const SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  PAYMENT_PROVIDER: [
    { value: "razorpay", label: "Razorpay" },
    { value: "cod", label: "Cash on delivery" },
    { value: "noop", label: "Noop (dev only)" },
  ],
  SHIPPING_PROVIDER: [
    { value: "delhivery", label: "Delhivery" },
    { value: "shiprocket", label: "Shiprocket" },
    { value: "noop", label: "Noop (dev only)" },
  ],
  SMS_PROVIDER: [
    { value: "msg91", label: "MSG91" },
    { value: "fast2sms", label: "Fast2SMS" },
    { value: "noop", label: "Noop (dev only)" },
  ],
  EMAIL_PROVIDER: [{ value: "resend", label: "Resend" }],
};

const BOOLEAN_KEYS = new Set([
  "NOTIFY_EMAIL_ENABLED",
  "NOTIFY_SMS_ENABLED",
  "NOTIFY_WHATSAPP_ENABLED",
  "PAYMENT_PROVIDER_FAILOVER_ENABLED",
  "SHIPPING_PROVIDER_FAILOVER_ENABLED",
]);

function isSecretKey(key: string): boolean {
  if (key.endsWith("_KEY_ID") || key.endsWith("_FROM") || key.endsWith("_EMAIL")) {
    return false;
  }
  return /(_SECRET|_TOKEN|_PASSWORD|_AUTH_KEY|_API_KEY|_APP_SECRET|OPS_METRICS_TOKEN|REPLAY_APPROVAL_TOKEN|OPS_COOKIE_SECRET)/.test(
    key,
  );
}

function humanizeKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildOpsConfigFieldDefinitions(
  overview: OpsConfigOverview,
  stored: OpsStoredConfig,
): OpsConfigFieldDefinition[] {
  const storedByKey = new Map(stored.items.map((item) => [item.key, item.maskedValue]));

  return overview.domains.flatMap((group) =>
    group.items
      .filter((item) => item.mutableViaOps && item.runtimeSource !== "env-bootstrap")
      .map((item) => {
        const selectOptions = SELECT_OPTIONS[item.key];
        let inputKind: OpsConfigFieldDefinition["inputKind"] = "text";
        if (BOOLEAN_KEYS.has(item.key)) {
          inputKind = "boolean";
        } else if (selectOptions) {
          inputKind = "select";
        } else if (isSecretKey(item.key)) {
          inputKind = "secret";
        }

        return {
          key: item.key,
          domain: group.domain,
          label: humanizeKey(item.key),
          ...(item.note ? { hint: item.note } : {}),
          inputKind,
          ...(selectOptions ? { options: selectOptions } : {}),
          requiresRestart: item.requiresRestart,
          present: item.present,
          ...(storedByKey.has(item.key) ? { storedMasked: storedByKey.get(item.key) } : {}),
        };
      }),
  );
}

export function groupOpsConfigFieldsByDomain(
  fields: OpsConfigFieldDefinition[],
): Array<{ domain: OpsConfigDomain; label: string; fields: OpsConfigFieldDefinition[] }> {
  const domainLabels: Record<OpsConfigDomain, string> = {
    core: "Core Runtime",
    payments: "Payments",
    shipping: "Shipping",
    notifications: "Notifications",
    opsSecurity: "Ops Security",
  };

  const order: OpsConfigDomain[] = [
    "core",
    "payments",
    "shipping",
    "notifications",
    "opsSecurity",
  ];

  return order
    .map((domain) => ({
      domain,
      label: domainLabels[domain],
      fields: fields.filter((field) => field.domain === domain),
    }))
    .filter((group) => group.fields.length > 0);
}
