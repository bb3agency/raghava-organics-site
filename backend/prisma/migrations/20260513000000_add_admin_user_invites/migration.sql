CREATE TYPE "AdminInviteStatus" AS ENUM ('CREATED', 'EMAIL_SENT', 'CONSUMED', 'EXPIRED_CLEANED', 'CANCELLED');

CREATE TABLE "AdminUserInvite" (
  "id" TEXT NOT NULL,
  "inviteEmail" TEXT NOT NULL,
  "inviteName" TEXT NOT NULL,
  "inviteTokenHash" TEXT NOT NULL,
  "setupBaseUrl" TEXT NOT NULL,
  "status" "AdminInviteStatus" NOT NULL DEFAULT 'CREATED',
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdByOpsUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUserInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUserInvite_inviteTokenHash_key" ON "AdminUserInvite"("inviteTokenHash");
CREATE INDEX "AdminUserInvite_status_expiresAt_idx" ON "AdminUserInvite"("status", "expiresAt");
CREATE INDEX "AdminUserInvite_inviteEmail_idx" ON "AdminUserInvite"("inviteEmail");

ALTER TABLE "AdminUserInvite"
  ADD CONSTRAINT "AdminUserInvite_createdByOpsUserId_fkey"
  FOREIGN KEY ("createdByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
