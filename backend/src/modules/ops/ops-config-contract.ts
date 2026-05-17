export type OpsConfigDomain = 'core' | 'payments' | 'shipping' | 'notifications' | 'opsSecurity';

export type OpsConfigOverviewItem = {
  key: string;
  mutableViaOps: boolean;
  requiresRestart: boolean;
  runtimeSource?: 'env-bootstrap' | 'db-overlay';
  note?: string;
};

export const OPS_CONFIG_BOOTSTRAP_ENV_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'OPS_DB_ENCRYPTION_KEY'
] as const;

const OPS_CONFIG_BOOTSTRAP_ENV_KEY_SET = new Set<string>(OPS_CONFIG_BOOTSTRAP_ENV_KEYS);

export const OPS_CONFIG_OVERVIEW_GROUPS: Array<{
  domain: OpsConfigDomain;
  label: string;
  items: OpsConfigOverviewItem[];
}> = [
  {
    domain: 'core',
    label: 'Core Runtime',
    items: [
      { key: 'NODE_ENV', mutableViaOps: true, requiresRestart: true },
      { key: 'CLIENT_ID', mutableViaOps: true, requiresRestart: true },
      { key: 'DATABASE_URL', mutableViaOps: false, requiresRestart: true, runtimeSource: 'env-bootstrap', note: 'Bootstrap-only: must come from deployment environment before DB config can be read.' },
      { key: 'REDIS_URL', mutableViaOps: false, requiresRestart: true, runtimeSource: 'env-bootstrap', note: 'Bootstrap-only initial Redis URL; DB overlay cannot be used to establish the first Redis connection.' },
      { key: 'JWT_SECRET', mutableViaOps: true, requiresRestart: true },
      { key: 'JWT_REFRESH_SECRET', mutableViaOps: true, requiresRestart: true },
      { key: 'INVOICE_STORAGE_ROOT', mutableViaOps: true, requiresRestart: true }
    ]
  },
  {
    domain: 'payments',
    label: 'Payments',
    items: [
      { key: 'PAYMENT_PROVIDER', mutableViaOps: true, requiresRestart: true },
      { key: 'PAYMENT_PROVIDER_FAILOVER_ENABLED', mutableViaOps: true, requiresRestart: true },
      { key: 'PAYMENT_CB_FAILURE_THRESHOLD', mutableViaOps: true, requiresRestart: true },
      { key: 'PAYMENT_CB_COOLDOWN_MS', mutableViaOps: true, requiresRestart: true },
      { key: 'RAZORPAY_KEY_ID', mutableViaOps: true, requiresRestart: true },
      { key: 'RAZORPAY_KEY_SECRET', mutableViaOps: true, requiresRestart: true },
      { key: 'RAZORPAY_WEBHOOK_SECRET', mutableViaOps: true, requiresRestart: true },
      { key: 'RAZORPAY_WEBHOOK_SECRET_OLD', mutableViaOps: true, requiresRestart: true, note: 'Optional secret used during webhook secret rotation.' },
      { key: 'RAZORPAY_WEBHOOK_ALLOWLIST_CIDR', mutableViaOps: true, requiresRestart: true },
      { key: 'RAZORPAY_WEBHOOK_MAX_SKEW_SECONDS', mutableViaOps: true, requiresRestart: true }
    ]
  },
  {
    domain: 'shipping',
    label: 'Shipping',
    items: [
      { key: 'SHIPPING_PROVIDER', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPPING_PROVIDER_FAILOVER_ENABLED', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPPING_CB_FAILURE_THRESHOLD', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPPING_CB_COOLDOWN_MS', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPPING_WEBHOOK_ALLOWLIST_CIDR', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_API_KEY', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_BASE_URL', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_PICKUP_PINCODE', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_WEBHOOK_TOKEN', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_WEBHOOK_ALLOWLIST_CIDR', mutableViaOps: true, requiresRestart: true },
      { key: 'DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_EMAIL', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_BASE_URL', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_PICKUP_PINCODE', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_PASSWORD', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_WEBHOOK_TOKEN', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_WEBHOOK_ALLOWLIST_CIDR', mutableViaOps: true, requiresRestart: true },
      { key: 'SHIPROCKET_WEBHOOK_MAX_SKEW_SECONDS', mutableViaOps: true, requiresRestart: true }
    ]
  },
  {
    domain: 'notifications',
    label: 'Notifications',
    items: [
      { key: 'NOTIFY_EMAIL_ENABLED', mutableViaOps: true, requiresRestart: true },
      { key: 'NOTIFY_SMS_ENABLED', mutableViaOps: true, requiresRestart: true },
      { key: 'NOTIFY_WHATSAPP_ENABLED', mutableViaOps: true, requiresRestart: true },
      { key: 'SMS_PROVIDER', mutableViaOps: true, requiresRestart: true, note: 'msg91 | fast2sms | noop' },
      { key: 'RESEND_API_KEY', mutableViaOps: true, requiresRestart: true },
      { key: 'RESEND_FROM', mutableViaOps: true, requiresRestart: true },
      { key: 'MSG91_AUTH_KEY', mutableViaOps: true, requiresRestart: true },
      { key: 'MSG91_SENDER_ID', mutableViaOps: true, requiresRestart: true },
      { key: 'MSG91_ROUTE', mutableViaOps: true, requiresRestart: true },
      { key: 'FAST2SMS_API_KEY', mutableViaOps: true, requiresRestart: true },
      { key: 'META_WHATSAPP_ACCESS_TOKEN', mutableViaOps: true, requiresRestart: true },
      { key: 'META_WHATSAPP_PHONE_NUMBER_ID', mutableViaOps: true, requiresRestart: true },
      { key: 'META_WHATSAPP_API_VERSION', mutableViaOps: true, requiresRestart: true },
      { key: 'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN', mutableViaOps: true, requiresRestart: true },
      { key: 'META_WHATSAPP_APP_SECRET', mutableViaOps: true, requiresRestart: true }
    ]
  },
  {
    domain: 'opsSecurity',
    label: 'Ops Security',
    items: [
      { key: 'OPS_METRICS_TOKEN', mutableViaOps: true, requiresRestart: true },
      { key: 'OPS_METRICS_ALLOWLIST', mutableViaOps: true, requiresRestart: true },
      { key: 'OPS_DUAL_APPROVAL_WINDOW_MINUTES', mutableViaOps: true, requiresRestart: true },
      { key: 'OPS_MFA_ENFORCE', mutableViaOps: true, requiresRestart: true },
      { key: 'OPS_API_KEY_SALT', mutableViaOps: true, requiresRestart: true },
      { key: 'ADMIN_MFA_ENCRYPTION_KEY', mutableViaOps: true, requiresRestart: true },
      { key: 'OPS_DB_ENCRYPTION_KEY', mutableViaOps: false, requiresRestart: true, runtimeSource: 'env-bootstrap', note: 'Bootstrap-only encryption key required to decrypt DB-stored ops config.' },
      { key: 'REPLAY_APPROVAL_TOKEN', mutableViaOps: true, requiresRestart: true }
    ]
  }
];

const OPS_CONFIG_MUTABLE_KEYS = new Set(
  OPS_CONFIG_OVERVIEW_GROUPS.flatMap((group) => group.items.filter((item) => item.mutableViaOps).map((item) => item.key))
);

const OPS_CONFIG_KNOWN_KEYS = new Set(
  OPS_CONFIG_OVERVIEW_GROUPS.flatMap((group) => group.items.map((item) => item.key))
);

const OPS_CONFIG_REQUIRED_BY_PROVIDER: Record<string, Record<string, string[]>> = {
  PAYMENT_PROVIDER: {
    razorpay: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    cod: [],
    noop: []
  },
  SHIPPING_PROVIDER: {
    delhivery: ['DELHIVERY_API_KEY'],
    shiprocket: ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'],
    noop: []
  },
  SMS_PROVIDER: {
    msg91: ['MSG91_AUTH_KEY', 'MSG91_SENDER_ID'],
    fast2sms: ['FAST2SMS_API_KEY'],
    noop: []
  }
};

const OPS_CONFIG_STRICT_ADDITIONAL_REQUIRED_BY_PROVIDER: Record<string, Record<string, string[]>> = {
  SHIPPING_PROVIDER: {
    delhivery: ['DELHIVERY_WEBHOOK_TOKEN'],
    shiprocket: ['SHIPROCKET_WEBHOOK_TOKEN']
  }
};

const OPS_CONFIG_REQUIRED_BY_FLAG: Record<string, string[]> = {
  NOTIFY_EMAIL_ENABLED: ['RESEND_API_KEY', 'RESEND_FROM'],
  NOTIFY_SMS_ENABLED: [],
  NOTIFY_WHATSAPP_ENABLED: [
    'META_WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'META_WHATSAPP_APP_SECRET'
  ]
};

const OPS_CONFIG_STRICT_BASE_REQUIRED = [
  'OPS_METRICS_TOKEN',
  'OPS_API_KEY_SALT',
  'ADMIN_MFA_ENCRYPTION_KEY',
  'OPS_DUAL_APPROVAL_WINDOW_MINUTES',
  'REPLAY_APPROVAL_TOKEN'
];

function isEnabled(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function getProviderValue(draftEnv: NodeJS.ProcessEnv, key: string, fallback: string): string {
  return (draftEnv[key] ?? fallback).trim().toLowerCase();
}

export function isOpsConfigMutableKey(key: string): boolean {
  return OPS_CONFIG_MUTABLE_KEYS.has(key);
}

export function isOpsConfigKnownKey(key: string): boolean {
  return OPS_CONFIG_KNOWN_KEYS.has(key);
}

export function isOpsConfigBootstrapKey(key: string): boolean {
  return OPS_CONFIG_BOOTSTRAP_ENV_KEY_SET.has(key);
}

export function isOpsConfigRuntimeOverlayKey(key: string): boolean {
  return isOpsConfigMutableKey(key) && !isOpsConfigBootstrapKey(key);
}

export function listOpsConfigMutableKeys(): string[] {
  return [...OPS_CONFIG_MUTABLE_KEYS];
}

export function listOpsConfigRuntimeOverlayKeys(): string[] {
  return listOpsConfigMutableKeys().filter((key) => !isOpsConfigBootstrapKey(key));
}

export function computeRequiredOpsConfigKeys(draftEnv: NodeJS.ProcessEnv, strictProfile: boolean): string[] {
  const required = new Set<string>(['PAYMENT_PROVIDER', 'SHIPPING_PROVIDER', 'SMS_PROVIDER']);

  for (const [providerKey, providerMap] of Object.entries(OPS_CONFIG_REQUIRED_BY_PROVIDER)) {
    const providerValue = getProviderValue(draftEnv, providerKey, providerKey === 'PAYMENT_PROVIDER' ? 'razorpay' : 'delhivery');
    for (const key of providerMap[providerValue] ?? []) {
      required.add(key);
    }
  }

  for (const [flagKey, keys] of Object.entries(OPS_CONFIG_REQUIRED_BY_FLAG)) {
    if (isEnabled(draftEnv[flagKey])) {
      for (const key of keys) {
        required.add(key);
      }
    }
  }

  if (strictProfile) {
    for (const key of OPS_CONFIG_STRICT_BASE_REQUIRED) {
      required.add(key);
    }

    for (const [providerKey, strictMap] of Object.entries(OPS_CONFIG_STRICT_ADDITIONAL_REQUIRED_BY_PROVIDER)) {
      const providerValue = getProviderValue(draftEnv, providerKey, providerKey === 'PAYMENT_PROVIDER' ? 'razorpay' : 'delhivery');
      for (const key of strictMap[providerValue] ?? []) {
        required.add(key);
      }
    }
  }

  return [...required];
}

export function findMissingStrictOpsConfigKeys(draftEnv: NodeJS.ProcessEnv): string[] {
  return computeRequiredOpsConfigKeys(draftEnv, true).filter((key) => !(draftEnv[key] ?? '').trim());
}
