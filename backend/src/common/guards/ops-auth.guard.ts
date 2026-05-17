import { compare } from 'bcryptjs';
import { verify } from 'otplib';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { isIpAllowlisted, parseWebhookIpAllowlist, resolveSecurityClientIp } from '@common/security/webhook-allowlist';
import { OpsPermissionValue } from '@common/auth/ops-permissions';
import { decryptMfaSecret } from '@common/auth/mfa-crypto';

function isProductionLikeRuntime(): boolean {
  const env = (process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  return env !== 'development' && env !== 'test';
}

function apiKeyCandidates(rawApiKey: string): string[] {
  const salt = process.env.OPS_API_KEY_SALT?.trim();
  if (!salt) {
    return [rawApiKey];
  }
  return [`${rawApiKey}.${salt}`, rawApiKey];
}

type OpsUserRecord = {
  id: string;
  email: string;
  name: string;
  apiKeyHash: string;
  apiKeyId: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  isActive: boolean;
  ipAllowlist: string[];
  permissions: OpsPermissionValue[];
};

type OpsPrismaLike = {
  opsUser: {
    findUnique(args: {
      where: { apiKeyId: string };
      select: {
        id: true;
        email: true;
        name: true;
        apiKeyHash: true;
        apiKeyId: true;
        mfaEnabled: true;
        mfaSecretEncrypted: true;
        isActive: true;
        ipAllowlist: true;
        permissions: true;
      };
    }): Promise<OpsUserRecord | null>;
  };
};

export async function opsAuthGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const keyIdHeader = request.headers['x-ops-key-id'];
  const apiKeyHeader = request.headers['x-ops-api-key'];
  const mfaHeader = request.headers['x-ops-mfa-code'];

  const apiKeyId = Array.isArray(keyIdHeader) ? keyIdHeader[0]?.trim() : keyIdHeader?.trim();
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0]?.trim() : apiKeyHeader?.trim();
  const mfaCode = Array.isArray(mfaHeader) ? mfaHeader[0]?.trim() : mfaHeader?.trim();

  if (!apiKeyId || !apiKey) {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401, {
      kind: 'auth',
      hintKey: 'ops_api_key_required',
      retryable: false,
      retryAfterSeconds: null,
      remediation: 'Provide x-ops-key-id and x-ops-api-key headers.'
    });
  }

  const prisma = request.server.prisma as unknown as OpsPrismaLike;
  const opsUser = await prisma.opsUser.findUnique({
    where: { apiKeyId },
    select: {
      id: true,
      email: true,
      name: true,
      apiKeyHash: true,
      apiKeyId: true,
      mfaEnabled: true,
      mfaSecretEncrypted: true,
      isActive: true,
      ipAllowlist: true,
      permissions: true
    }
  }) as OpsUserRecord | null;

  if (!opsUser || !opsUser.isActive) {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid ops credentials', 401);
  }

  let matched = false;
  for (const candidate of apiKeyCandidates(apiKey)) {
    if (await compare(candidate, opsUser.apiKeyHash)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid ops credentials', 401);
  }

  const ipRules = parseWebhookIpAllowlist(opsUser.ipAllowlist.join(','));
  const trustedProxyRules = parseWebhookIpAllowlist(process.env.TRUSTED_PROXY_ALLOWLIST_CIDR);
  const resolvedClientIp = resolveSecurityClientIp({
    directRemoteIp: request.raw.socket.remoteAddress ?? null,
    derivedRequestIp: request.ip,
    trustedProxyRules
  });
  if (ipRules.length === 0 && isProductionLikeRuntime()) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Ops IP allowlist must be configured in production', 403);
  }
  if (!resolvedClientIp || !isIpAllowlisted(resolvedClientIp, ipRules)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Ops access denied for source IP', 403, {
      kind: 'permission',
      hintKey: 'ops_ip_not_allowlisted',
      retryable: false,
      retryAfterSeconds: null,
      remediation: 'Use an allowlisted network or update OpsUser IP allowlist.'
    });
  }

  if (opsUser.mfaEnabled || process.env.OPS_MFA_ENFORCE?.trim().toLowerCase() === 'true') {
    if (!mfaCode) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops MFA code is required', 401);
    }
    if (!opsUser.mfaSecretEncrypted) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Ops user has MFA enabled but no MFA secret is stored. Re-provision MFA for this user.',
        500
      );
    }
    const secret = decryptMfaSecret(opsUser.mfaSecretEncrypted);
    const valid = await verify({ token: mfaCode, secret });
    if (!valid) {
      throw new AppError(ERROR_CODES.UNAUTHORISED, 'Invalid ops MFA code', 401);
    }
  }

  (request as FastifyRequest & {
    opsUser?: {
      id: string;
      email: string;
      name: string;
      permissions: OpsPermissionValue[];
    };
  }).opsUser = {
    id: opsUser.id,
    email: opsUser.email,
    name: opsUser.name,
    permissions: opsUser.permissions
  };
}
