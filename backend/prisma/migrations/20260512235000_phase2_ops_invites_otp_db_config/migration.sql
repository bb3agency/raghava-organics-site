-- Phase 2 ops foundations: invite lifecycle, email OTP challenges, encrypted DB config storage

ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'INVITE_CREATED';
ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'INVITE_CONSUMED';
ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'INVITE_EXPIRED_CLEANED';
ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'OTP_CHALLENGE_REQUESTED';
ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'OTP_CHALLENGE_VERIFIED';
ALTER TYPE "OpsActionType" ADD VALUE IF NOT EXISTS 'OTP_CHALLENGE_FAILED';

CREATE TYPE "OpsInviteStatus" AS ENUM ('CREATED', 'EMAIL_SENT', 'CONSUMED', 'EXPIRED_CLEANED', 'CANCELLED');
CREATE TYPE "OpsOtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');
CREATE TYPE "OpsConfigDomain" AS ENUM ('CORE', 'PAYMENTS', 'SHIPPING', 'NOTIFICATIONS', 'OPS_SECURITY');

CREATE TABLE "OpsUserInvite" (
  "id" TEXT NOT NULL,
  "inviteEmail" TEXT NOT NULL,
  "inviteName" TEXT NOT NULL,
  "inviteTokenHash" TEXT NOT NULL,
  "setupBaseUrl" TEXT NOT NULL,
  "status" "OpsInviteStatus" NOT NULL DEFAULT 'CREATED',
  "permissions" "OpsPermission"[] DEFAULT ARRAY['OPS_READ']::"OpsPermission"[],
  "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdByOpsUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsUserInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsUserInvite_inviteTokenHash_key" ON "OpsUserInvite"("inviteTokenHash");
CREATE INDEX "OpsUserInvite_status_expiresAt_idx" ON "OpsUserInvite"("status", "expiresAt");
CREATE INDEX "OpsUserInvite_inviteEmail_idx" ON "OpsUserInvite"("inviteEmail");

ALTER TABLE "OpsUserInvite"
  ADD CONSTRAINT "OpsUserInvite_createdByOpsUserId_fkey"
  FOREIGN KEY ("createdByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OpsOtpChallenge" (
  "id" TEXT NOT NULL,
  "opsUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "status" "OpsOtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpsOtpChallenge_opsUserId_createdAt_idx" ON "OpsOtpChallenge"("opsUserId", "createdAt");
CREATE INDEX "OpsOtpChallenge_status_expiresAt_idx" ON "OpsOtpChallenge"("status", "expiresAt");

ALTER TABLE "OpsOtpChallenge"
  ADD CONSTRAINT "OpsOtpChallenge_opsUserId_fkey"
  FOREIGN KEY ("opsUserId") REFERENCES "OpsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OpsConfigSecret" (
  "id" TEXT NOT NULL,
  "opsUserId" TEXT NOT NULL,
  "domain" "OpsConfigDomain" NOT NULL,
  "secretKey" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "requiresRestart" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsConfigSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsConfigSecret_domain_secretKey_key" ON "OpsConfigSecret"("domain", "secretKey");
CREATE INDEX "OpsConfigSecret_opsUserId_createdAt_idx" ON "OpsConfigSecret"("opsUserId", "createdAt");
CREATE INDEX "OpsConfigSecret_domain_isActive_idx" ON "OpsConfigSecret"("domain", "isActive");

ALTER TABLE "OpsConfigSecret"
  ADD CONSTRAINT "OpsConfigSecret_opsUserId_fkey"
  FOREIGN KEY ("opsUserId") REFERENCES "OpsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
