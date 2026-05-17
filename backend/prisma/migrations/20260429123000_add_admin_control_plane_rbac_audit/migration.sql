-- Per-admin permission grants
CREATE TABLE "AdminPermissionGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminPermissionGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminPermissionGrant_userId_permission_key"
  ON "AdminPermissionGrant"("userId", "permission");
CREATE INDEX "AdminPermissionGrant_userId_idx"
  ON "AdminPermissionGrant"("userId");

ALTER TABLE "AdminPermissionGrant"
  ADD CONSTRAINT "AdminPermissionGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unified admin mutation audit log
CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "correlationId" TEXT,
  "requestPath" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx"
  ON "AdminAuditLog"("adminUserId", "createdAt");
CREATE INDEX "AdminAuditLog_resourceType_createdAt_idx"
  ON "AdminAuditLog"("resourceType", "createdAt");
CREATE INDEX "AdminAuditLog_outcome_createdAt_idx"
  ON "AdminAuditLog"("outcome", "createdAt");

ALTER TABLE "AdminAuditLog"
  ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
