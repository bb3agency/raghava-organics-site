import crypto from 'crypto';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';

/**
 * Resolves the AES-256-GCM key used to encrypt and decrypt TOTP secrets at rest.
 *
 * Primary source: `ADMIN_MFA_ENCRYPTION_KEY`.
 * Fallback (dev-like only): `JWT_REFRESH_SECRET` — see app.config.ts `validateMfaKeyIsolation`
 * for the startup warning emitted when the fallback is active.
 *
 * The returned Buffer is always a SHA-256 digest of the raw env value, giving a
 * deterministic 32-byte key regardless of input length.
 */
export function resolveMfaEncryptionKey(): Buffer {
  const raw = process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim() || process.env.JWT_REFRESH_SECRET?.trim();
  if (!raw) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'MFA encryption key is not configured', 500);
  }
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypts a TOTP secret using AES-256-GCM.
 *
 * Output format: `<iv_b64url>.<tag_b64url>.<ciphertext_b64url>`
 */
export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const key = resolveMfaEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret produced by `encryptMfaSecret`.
 *
 * Throws `AppError(500)` on malformed payload or decryption failure.
 */
export function decryptMfaSecret(payload: string): string {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Stored MFA secret is malformed', 500);
  }
  const key = resolveMfaEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]);
  return decrypted.toString('utf8');
}
