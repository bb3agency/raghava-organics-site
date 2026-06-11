import { describe, expect, it } from 'vitest';

import {
  computeRequiredOpsConfigKeys,
  findMissingStrictOpsConfigKeys,
  isOpsConfigBootstrapKey,
  isOpsConfigMutableKey,
  isOpsConfigRuntimeOverlayKey,
  isOpsConfigSecretKey,
  listOpsConfigMutableKeys,
  listOpsConfigRuntimeOverlayKeys,
  OPS_CONFIG_OVERVIEW_GROUPS
} from './ops-config-contract';

describe('ops config contract', () => {
  it('keeps bootstrap keys out of the DB runtime overlay policy', () => {
    expect(isOpsConfigBootstrapKey('DATABASE_URL')).toBe(true);
    expect(isOpsConfigBootstrapKey('REDIS_URL')).toBe(true);
    expect(isOpsConfigBootstrapKey('OPS_DB_ENCRYPTION_KEY')).toBe(true);
    expect(isOpsConfigMutableKey('DATABASE_URL')).toBe(false);
    expect(isOpsConfigRuntimeOverlayKey('DATABASE_URL')).toBe(false);
    expect(isOpsConfigMutableKey('JWT_SECRET')).toBe(true);
  });

  it('NODE_ENV and CLIENT_ID are not overlay-able (security regression guard)', () => {
    expect(isOpsConfigMutableKey('NODE_ENV')).toBe(false);
    expect(isOpsConfigRuntimeOverlayKey('NODE_ENV')).toBe(false);
    expect(isOpsConfigMutableKey('CLIENT_ID')).toBe(false);
    expect(isOpsConfigRuntimeOverlayKey('CLIENT_ID')).toBe(false);
  });

  it('newly added dbOverlay keys are correctly classified as mutable runtime overlay keys', () => {
    expect(isOpsConfigMutableKey('EMAIL_PROVIDER')).toBe(true);
    expect(isOpsConfigRuntimeOverlayKey('EMAIL_PROVIDER')).toBe(true);
    expect(isOpsConfigMutableKey('REPLAY_AUDIT_RETENTION_DAYS')).toBe(true);
    expect(isOpsConfigRuntimeOverlayKey('REPLAY_AUDIT_RETENTION_DAYS')).toBe(true);
    expect(isOpsConfigMutableKey('TRUSTED_PROXY_ALLOWLIST_CIDR')).toBe(true);
    expect(isOpsConfigRuntimeOverlayKey('TRUSTED_PROXY_ALLOWLIST_CIDR')).toBe(true);
  });

  it('exposes expected mutable keys in allowlist', () => {
    const mutableKeys = listOpsConfigMutableKeys();
    expect(mutableKeys).toContain('PAYMENT_PROVIDER');
    expect(mutableKeys).toContain('MEDIA_STORAGE_PROVIDER');
    expect(mutableKeys).toContain('R2_BUCKET_NAME');
    expect(mutableKeys).toContain('RAZORPAY_KEY_ID');
    expect(mutableKeys).toContain('OPS_METRICS_TOKEN');
    expect(mutableKeys).not.toContain('OPS_DB_ENCRYPTION_KEY');
    expect(listOpsConfigRuntimeOverlayKeys()).toContain('RAZORPAY_KEY_ID');
    expect(listOpsConfigRuntimeOverlayKeys()).not.toContain('REDIS_URL');
  });

  it('computes provider-specific required keys for non-strict profile', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'razorpay',
        SHIPPING_PROVIDER: 'shiprocket',
        SMS_PROVIDER: 'msg91',
        NOTIFY_EMAIL_ENABLED: 'true',
        NOTIFY_SMS_ENABLED: 'true'
      },
      false
    );

    expect(required).toContain('PAYMENT_PROVIDER');
    expect(required).toContain('RAZORPAY_KEY_ID');
    expect(required).toContain('RAZORPAY_KEY_SECRET');
    expect(required).toContain('RAZORPAY_WEBHOOK_SECRET');
    expect(required).toContain('SHIPROCKET_EMAIL');
    expect(required).toContain('SHIPROCKET_PASSWORD');
    expect(required).toContain('RESEND_API_KEY');
    expect(required).toContain('RESEND_FROM');
    expect(required).toContain('SMS_PROVIDER');
    expect(required).toContain('MSG91_AUTH_KEY');
    expect(required).toContain('MSG91_SENDER_ID');
    expect(required).not.toContain('DELHIVERY_WEBHOOK_TOKEN');
    expect(required).not.toContain('FAST2SMS_API_KEY');
  });

  it('requires Fast2SMS keys when SMS_PROVIDER=fast2sms', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'cod',
        SHIPPING_PROVIDER: 'noop',
        SMS_PROVIDER: 'fast2sms',
        NOTIFY_SMS_ENABLED: 'true'
      },
      false
    );

    expect(required).toContain('SMS_PROVIDER');
    expect(required).toContain('FAST2SMS_API_KEY');
    expect(required).not.toContain('MSG91_AUTH_KEY');
    expect(required).not.toContain('MSG91_SENDER_ID');
  });

  it('requires no SMS keys when SMS_PROVIDER=noop', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'cod',
        SHIPPING_PROVIDER: 'noop',
        SMS_PROVIDER: 'noop',
        NOTIFY_SMS_ENABLED: 'true'
      },
      false
    );

    expect(required).toContain('SMS_PROVIDER');
    expect(required).not.toContain('FAST2SMS_API_KEY');
    expect(required).not.toContain('MSG91_AUTH_KEY');
    expect(required).not.toContain('MSG91_SENDER_ID');
  });

  it('adds strict-profile-only requirements', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'cod',
        SHIPPING_PROVIDER: 'delhivery',
        SMS_PROVIDER: 'msg91'
      },
      true
    );

    expect(required).toContain('OPS_METRICS_TOKEN');
    expect(required).toContain('REPLAY_APPROVAL_TOKEN');
    expect(required).toContain('DELHIVERY_WEBHOOK_TOKEN');
    expect(required).toContain('SHIPPING_WEBHOOK_ALLOWLIST_CIDR');
    expect(required).toContain('SMS_PROVIDER');
  });

  it('requires Shiprocket pickup pincode and location when shipping provider is shiprocket', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'cod',
        SHIPPING_PROVIDER: 'shiprocket',
        SMS_PROVIDER: 'noop'
      },
      false
    );

    expect(required).toContain('SHIPROCKET_EMAIL');
    expect(required).toContain('SHIPROCKET_PASSWORD');
    expect(required).toContain('SHIPROCKET_PICKUP_PINCODE');
    expect(required).toContain('SHIPROCKET_PICKUP_LOCATION');
  });

  it('requires Razorpay webhook allowlist in strict profile when payment provider is razorpay', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'razorpay',
        SHIPPING_PROVIDER: 'noop',
        SMS_PROVIDER: 'noop'
      },
      true
    );

    expect(required).toContain('RAZORPAY_WEBHOOK_ALLOWLIST_CIDR');
  });

  it('requires R2 keys when MEDIA_STORAGE_PROVIDER=r2', () => {
    const required = computeRequiredOpsConfigKeys(
      {
        PAYMENT_PROVIDER: 'cod',
        SHIPPING_PROVIDER: 'noop',
        SMS_PROVIDER: 'noop',
        MEDIA_STORAGE_PROVIDER: 'r2'
      },
      false
    );

    expect(required).toContain('R2_ACCOUNT_ID');
    expect(required).toContain('R2_ACCESS_KEY_ID');
    expect(required).toContain('R2_SECRET_ACCESS_KEY');
    expect(required).toContain('R2_BUCKET_NAME');
    expect(required).toContain('R2_PUBLIC_BASE_URL');
  });

  it('detects missing strict keys', () => {
    const missing = findMissingStrictOpsConfigKeys({
      PAYMENT_PROVIDER: 'cod',
      SHIPPING_PROVIDER: 'delhivery',
      SMS_PROVIDER: 'msg91',
      OPS_METRICS_TOKEN: 'token-present'
    });

    expect(missing).toContain('REPLAY_APPROVAL_TOKEN');
    expect(missing).toContain('DELHIVERY_API_KEY');
    expect(missing).toContain('DELHIVERY_WEBHOOK_TOKEN');
    expect(missing).toContain('MSG91_AUTH_KEY');
    expect(missing).toContain('MSG91_SENDER_ID');
  });

  it('ensures overview groups contain unique keys', () => {
    const allKeys = OPS_CONFIG_OVERVIEW_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    const unique = new Set(allKeys);
    expect(unique.size).toBe(allKeys.length);
  });

  describe('isOpsConfigSecretKey — secret vs non-secret classification', () => {
    // This predicate is used by the FRONTEND ops-config editor to decide
    // whether to render an input as <input type="password"> with an eye
    // toggle (secret) or as plain <input type="text"> (non-secret). It is
    // NOT used to gate plaintext disclosure over the wire — the
    // /api/v1/ops/config/stored route now returns plaintextValue for every
    // active row, including real secrets, as a deliberate operator-UX
    // policy for the platform-operator-only Ops console. See
    // ops.service.ts → getStoredConfigSecrets JSDoc for the full rationale.
    //
    // Real cryptographic secrets — frontend renders as password-type input.
    it.each([
      ['JWT_SECRET'],
      ['JWT_REFRESH_SECRET'],
      ['RAZORPAY_KEY_SECRET'],
      ['RAZORPAY_WEBHOOK_SECRET'],
      ['RAZORPAY_WEBHOOK_SECRET_OLD'],
      ['DELHIVERY_API_KEY'],
      ['DELHIVERY_WEBHOOK_TOKEN'],
      ['SHIPROCKET_PASSWORD'],
      ['SHIPROCKET_WEBHOOK_TOKEN'],
      ['RESEND_API_KEY'],
      ['MSG91_AUTH_KEY'],
      ['FAST2SMS_API_KEY'],
      ['META_WHATSAPP_ACCESS_TOKEN'],
      ['META_WHATSAPP_WEBHOOK_VERIFY_TOKEN'],
      ['META_WHATSAPP_APP_SECRET'],
      ['OPS_METRICS_TOKEN'],
      ['REPLAY_APPROVAL_TOKEN'],
      ['OPS_COOKIE_SECRET'],
      ['R2_SECRET_ACCESS_KEY']
    ])('classifies %s as secret', (key) => {
      expect(isOpsConfigSecretKey(key)).toBe(true);
    });

    // Non-secret keys — operator-visible plaintext is intentional so the
    // Ops UI editor can prefill the field with the saved value.
    it.each([
      ['SHIPPING_PROVIDER'],
      ['SHIPPING_PROVIDER_FAILOVER_ENABLED'],
      ['SHIPPING_CB_FAILURE_THRESHOLD'],
      ['SHIPPING_CB_COOLDOWN_MS'],
      ['SHIPPING_WEBHOOK_ALLOWLIST_CIDR'],
      ['PAYMENT_PROVIDER'],
      ['PAYMENT_PROVIDER_FAILOVER_ENABLED'],
      ['PAYMENT_CB_FAILURE_THRESHOLD'],
      ['PAYMENT_CB_COOLDOWN_MS'],
      ['RAZORPAY_WEBHOOK_ALLOWLIST_CIDR'],
      ['RAZORPAY_WEBHOOK_MAX_SKEW_SECONDS'],
      ['DELHIVERY_BASE_URL'],
      ['DELHIVERY_PICKUP_PINCODE'],
      ['DELHIVERY_WEBHOOK_ALLOWLIST_CIDR'],
      ['DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS'],
      ['SHIPROCKET_BASE_URL'],
      ['SHIPROCKET_PICKUP_PINCODE'],
      ['SHIPROCKET_PICKUP_LOCATION'],
      ['SHIPROCKET_WEBHOOK_ALLOWLIST_CIDR'],
      ['SHIPROCKET_WEBHOOK_MAX_SKEW_SECONDS'],
      ['NOTIFY_EMAIL_ENABLED'],
      ['NOTIFY_SMS_ENABLED'],
      ['NOTIFY_WHATSAPP_ENABLED'],
      ['EMAIL_PROVIDER'],
      ['SMS_PROVIDER'],
      ['MSG91_SENDER_ID'],
      ['MSG91_ROUTE'],
      ['META_WHATSAPP_PHONE_NUMBER_ID'],
      ['META_WHATSAPP_API_VERSION'],
      ['OPS_METRICS_ALLOWLIST'],
      ['REPLAY_AUDIT_RETENTION_DAYS'],
      ['TRUSTED_PROXY_ALLOWLIST_CIDR'],
      ['INVOICE_STORAGE_ROOT'],
      ['MEDIA_STORAGE_PROVIDER'],
      ['R2_ACCOUNT_ID'],
      ['R2_ACCESS_KEY_ID'],
      ['R2_BUCKET_NAME'],
      ['R2_PUBLIC_BASE_URL'],
      ['R2_ENDPOINT'],
      ['MEDIA_STORAGE_ROOT'],
      ['MEDIA_CDN_BASE_URL']
    ])('classifies %s as non-secret', (key) => {
      expect(isOpsConfigSecretKey(key)).toBe(false);
    });

    // Special early-return suffixes — these contain substrings that look
    // secret-ish but the suffix proves they're public identifiers.
    it('classifies RAZORPAY_KEY_ID as non-secret (public key id, NOT the secret)', () => {
      expect(isOpsConfigSecretKey('RAZORPAY_KEY_ID')).toBe(false);
    });
    it('classifies RESEND_FROM as non-secret (public sender address)', () => {
      expect(isOpsConfigSecretKey('RESEND_FROM')).toBe(false);
    });
    it('classifies SHIPROCKET_EMAIL as non-secret (login email; paired with separately-masked SHIPROCKET_PASSWORD)', () => {
      expect(isOpsConfigSecretKey('SHIPROCKET_EMAIL')).toBe(false);
    });

    // Regression guard for the SECONDS vs SECRET confusion: a non-secret
    // integer threshold ending in `_SECONDS` must NOT be confused with the
    // `_SECRET` substring matcher.
    it('does NOT confuse _SECONDS suffix with _SECRET pattern', () => {
      expect(isOpsConfigSecretKey('SHIPROCKET_WEBHOOK_MAX_SKEW_SECONDS')).toBe(false);
      expect(isOpsConfigSecretKey('DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS')).toBe(false);
      expect(isOpsConfigSecretKey('RAZORPAY_WEBHOOK_MAX_SKEW_SECONDS')).toBe(false);
      expect(isOpsConfigSecretKey('OPS_BROWSER_SESSION_TTL_SECONDS')).toBe(false);
      expect(isOpsConfigSecretKey('OPS_LOGIN_OTP_TTL_SECONDS')).toBe(false);
    });

    // Belt-and-braces contract check: every mutable key in the contract must
    // resolve to either secret or non-secret deterministically (no exceptions
    // thrown, no undefined output). This guards against future contract
    // additions that introduce ambiguous patterns.
    it('classifies every mutable ops config key deterministically', () => {
      for (const group of OPS_CONFIG_OVERVIEW_GROUPS) {
        for (const item of group.items) {
          if (!item.mutableViaOps) continue;
          const result = isOpsConfigSecretKey(item.key);
          expect(typeof result).toBe('boolean');
        }
      }
    });
  });
});
