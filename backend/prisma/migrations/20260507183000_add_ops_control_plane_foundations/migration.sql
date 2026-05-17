-- Ops control plane enums
CREATE TYPE "OpsPermission" AS ENUM ('OPS_READ', 'OPS_WRITE', 'OPS_APPROVE');
CREATE TYPE "OpsActionType" AS ENUM (
  'LOAD_SHED_CHANGE',
  'ENV_READ',
  'ENV_UPDATE',
  'CONTAINER_RESTART',
  'DB_BACKUP',
  'DB_RESTORE',
  'FEATURE_FLAG_TOGGLE'
);
CREATE TYPE "OpsActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- Dedicated ops identities
CREATE TABLE "OpsUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "apiKeyHash" TEXT NOT NULL,
  "mfaSecretEncrypted" TEXT NOT NULL,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT true,
  "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "permissions" "OpsPermission"[] DEFAULT ARRAY['OPS_READ']::"OpsPermission"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsUser_email_key" ON "OpsUser"("email");
CREATE UNIQUE INDEX "OpsUser_apiKeyId_key" ON "OpsUser"("apiKeyId");

-- Tamper-evident ops audit
CREATE TABLE "OpsAuditLog" (
  "id" TEXT NOT NULL,
  "opsUserId" TEXT NOT NULL,
  "actionType" "OpsActionType" NOT NULL,
  "actionStatus" "OpsActionStatus" NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestIp" TEXT NOT NULL,
  "requestPath" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "previousState" JSONB,
  "newState" JSONB,
  "summary" JSONB,
  "chainHash" TEXT NOT NULL,
  "previousChainHash" TEXT,
  "approvedByOpsUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsAuditLog_requestId_key" ON "OpsAuditLog"("requestId");
CREATE INDEX "OpsAuditLog_opsUserId_createdAt_idx" ON "OpsAuditLog"("opsUserId", "createdAt");
CREATE INDEX "OpsAuditLog_actionType_createdAt_idx" ON "OpsAuditLog"("actionType", "createdAt");
CREATE INDEX "OpsAuditLog_actionStatus_createdAt_idx" ON "OpsAuditLog"("actionStatus", "createdAt");

ALTER TABLE "OpsAuditLog"
  ADD CONSTRAINT "OpsAuditLog_opsUserId_fkey"
  FOREIGN KEY ("opsUserId") REFERENCES "OpsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dual-approval workflow for critical ops writes
CREATE TABLE "OpsDualApprovalRequest" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "actionType" "OpsActionType" NOT NULL,
  "status" "OpsActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "payload" JSONB NOT NULL,
  "confirmerId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsDualApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsDualApprovalRequest_requestId_key" ON "OpsDualApprovalRequest"("requestId");
CREATE INDEX "OpsDualApprovalRequest_status_expiresAt_idx" ON "OpsDualApprovalRequest"("status", "expiresAt");
CREATE INDEX "OpsDualApprovalRequest_requesterId_createdAt_idx" ON "OpsDualApprovalRequest"("requesterId", "createdAt");

ALTER TABLE "OpsDualApprovalRequest"
  ADD CONSTRAINT "OpsDualApprovalRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "OpsUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpsDualApprovalRequest"
  ADD CONSTRAINT "OpsDualApprovalRequest_confirmerId_fkey"
  FOREIGN KEY ("confirmerId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
