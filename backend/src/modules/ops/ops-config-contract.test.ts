import { describe, expect, it } from 'vitest';

import {
  computeRequiredOpsConfigKeys,
  findMissingStrictOpsConfigKeys,
  isOpsConfigBootstrapKey,
  isOpsConfigMutableKey,
  isOpsConfigRuntimeOverlayKey,
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
});
