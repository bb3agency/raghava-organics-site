import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'OPS_DB_ENCRYPTION_KEY'
] as const;

export function validateBootstrapEnv(): void {
  requiredEnvVars.forEach((envVar) => {
    requireEnv(envVar);
  });
}

function isEnabled(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

const DEVELOPMENT_LIKE_NODE_ENVS = new Set(['development', 'test']);

type RuntimeProfile = 'development-like' | 'production-like';

function getNormalizedNodeEnv(): string {
  return (process.env.NODE_ENV ?? 'development').trim().toLowerCase();
}

function resolveRuntimeProfile(nodeEnv: string = getNormalizedNodeEnv()): RuntimeProfile {
  return DEVELOPMENT_LIKE_NODE_ENVS.has(nodeEnv) ? 'development-like' : 'production-like';
}

function isProductionLikeProfile(nodeEnv: string = getNormalizedNodeEnv()): boolean {
  return resolveRuntimeProfile(nodeEnv) === 'production-like';
}

function isPlaceholderValue(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized.startsWith('replace_with_') ||
    normalized.startsWith('change_me') ||
    normalized.startsWith('<')
  );
}

function assertEnvNotPlaceholder(name: string): void {
  const value = requireEnv(name);
  if (isPlaceholderValue(value)) {
    throw new Error(`Invalid ${name}: placeholder values are not allowed in production-like profiles`);
  }
}

function validateSecureFlowEnv(): void {
  const nodeEnv = getNormalizedNodeEnv();
  const isStrictProfile = isProductionLikeProfile(nodeEnv);
  if (isStrictProfile && !process.env.REPLAY_APPROVAL_TOKEN?.trim()) {
    throw new Error('Missing required env var: REPLAY_APPROVAL_TOKEN (secure replay approval)');
  }
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('Invalid REDIS_URL format');
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error('REDIS_URL must use redis:// or rediss:// protocol');
  }
  if (isStrictProfile && !parsed.password) {
    throw new Error('REDIS_URL must include password in production-like profiles');
  }
}

function validateConditionalEnv(): void {
  const nodeEnv = getNormalizedNodeEnv();
  const isStrictProfile = isProductionLikeProfile(nodeEnv);
  const paymentProvider = (process.env.PAYMENT_PROVIDER ?? 'razorpay').trim().toLowerCase();

  if (paymentProvider === 'razorpay') {
    requireEnv('RAZORPAY_KEY_ID');
    requireEnv('RAZORPAY_KEY_SECRET');
    requireEnv('RAZORPAY_WEBHOOK_SECRET');
  } else if (!['cod', 'noop'].includes(paymentProvider)) {
    throw new Error(`Unsupported PAYMENT_PROVIDER: ${paymentProvider}. Allowed: razorpay, cod, noop`);
  }

  if (isEnabled(process.env.NOTIFY_EMAIL_ENABLED)) {
    requireEnv('RESEND_API_KEY');
    requireEnv('RESEND_FROM');
  }

  if (isEnabled(process.env.NOTIFY_SMS_ENABLED)) {
    const smsProvider = (process.env.SMS_PROVIDER ?? 'msg91').trim().toLowerCase();
    if (smsProvider === 'msg91') {
      requireEnv('MSG91_AUTH_KEY');
      requireEnv('MSG91_SENDER_ID');
    } else if (smsProvider === 'fast2sms') {
      requireEnv('FAST2SMS_API_KEY');
    } else if (smsProvider !== 'noop') {
      throw new Error(`Unsupported SMS_PROVIDER: ${smsProvider}. Allowed: msg91, fast2sms, noop`);
    }
  }

  if (isEnabled(process.env.NOTIFY_WHATSAPP_ENABLED)) {
    requireEnv('META_WHATSAPP_ACCESS_TOKEN');
    requireEnv('META_WHATSAPP_PHONE_NUMBER_ID');
    requireEnv('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    requireEnv('META_WHATSAPP_APP_SECRET');
  }

  // GST invoicing seller fields are DB-backed via StoreSettings; validated at runtime (API/workers) with alerts.

  if (isEnabled(process.env.OTEL_TRACING_ENABLED)) {
    requireEnv('OTEL_EXPORTER_OTLP_ENDPOINT');
  }

  const shippingProvider = (process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase();
  if (shippingProvider === 'delhivery') {
    requireEnv('DELHIVERY_API_KEY');
    if (isStrictProfile) {
      requireEnv('DELHIVERY_WEBHOOK_TOKEN');
    }
  } else if (shippingProvider === 'shiprocket') {
    requireEnv('SHIPROCKET_EMAIL');
    requireEnv('SHIPROCKET_PASSWORD');
    if (isStrictProfile) {
      requireEnv('SHIPROCKET_WEBHOOK_TOKEN');
    }
  } else if (shippingProvider !== 'noop') {
    throw new Error(`Unsupported SHIPPING_PROVIDER: ${shippingProvider}. Allowed: delhivery, shiprocket, noop`);
  }

  if (isStrictProfile) {
    requireEnv('OPS_METRICS_TOKEN');
    requireEnv('OPS_DB_ENCRYPTION_KEY');
  }
}

function validateProductionProviderSafetyEnv(): void {
  const nodeEnv = getNormalizedNodeEnv();
  const isStrictProfile = isProductionLikeProfile(nodeEnv);
  if (!isStrictProfile) {
    return;
  }

  const paymentProvider = (process.env.PAYMENT_PROVIDER ?? 'razorpay').trim().toLowerCase();
  const shippingProvider = (process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase();

  if (paymentProvider === 'noop') {
    throw new Error(
      `Invalid PAYMENT_PROVIDER=noop when NODE_ENV=${nodeEnv}. 'noop' is allowed only in development-like profiles (development/test).`
    );
  }
  if (shippingProvider === 'noop') {
    throw new Error(
      `Invalid SHIPPING_PROVIDER=noop when NODE_ENV=${nodeEnv}. 'noop' is allowed only in development-like profiles (development/test).`
    );
  }

  if (!['razorpay', 'cod'].includes(paymentProvider)) {
    throw new Error(`Unsupported PAYMENT_PROVIDER in production-like profile: ${paymentProvider}`);
  }
  if (!['delhivery', 'shiprocket'].includes(shippingProvider)) {
    throw new Error(`Unsupported SHIPPING_PROVIDER in production-like profile: ${shippingProvider}`);
  }

  assertEnvNotPlaceholder('JWT_SECRET');
  assertEnvNotPlaceholder('JWT_REFRESH_SECRET');
  assertEnvNotPlaceholder('OPS_METRICS_TOKEN');
  assertEnvNotPlaceholder('OPS_DB_ENCRYPTION_KEY');

  if (paymentProvider === 'razorpay') {
    assertEnvNotPlaceholder('RAZORPAY_KEY_ID');
    assertEnvNotPlaceholder('RAZORPAY_KEY_SECRET');
    assertEnvNotPlaceholder('RAZORPAY_WEBHOOK_SECRET');
    if (process.env.RAZORPAY_WEBHOOK_SECRET_OLD?.trim()) {
      assertEnvNotPlaceholder('RAZORPAY_WEBHOOK_SECRET_OLD');
    }
  }

  if (shippingProvider === 'delhivery') {
    assertEnvNotPlaceholder('DELHIVERY_API_KEY');
    assertEnvNotPlaceholder('DELHIVERY_WEBHOOK_TOKEN');
  }
  if (shippingProvider === 'shiprocket') {
    assertEnvNotPlaceholder('SHIPROCKET_EMAIL');
    assertEnvNotPlaceholder('SHIPROCKET_PASSWORD');
    assertEnvNotPlaceholder('SHIPROCKET_WEBHOOK_TOKEN');
  }
}

export function validateRuntimeEnv(): void {
  requireEnv('JWT_SECRET');
  requireEnv('JWT_REFRESH_SECRET');
  validateSecureFlowEnv();
  validateConditionalEnv();
  validateProductionProviderSafetyEnv();
}

export function getAppConfig() {
  return {
    env: getNormalizedNodeEnv(),
    runtimeProfile: resolveRuntimeProfile(),
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    apiPrefix: '/api/v1'
  };
}

export const appConfig = getAppConfig();

