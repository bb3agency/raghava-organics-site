-- AlterTable
ALTER TABLE "User"
ADD COLUMN "adminMfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "adminMfaSecretEncrypted" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken"
ADD COLUMN "jti" TEXT,
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "deviceKeyHash" TEXT,
ADD COLUMN "consumedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

-- Backfill deterministic placeholders for existing rows.
UPDATE "RefreshToken"
SET
  "jti" = "id",
  "sessionId" = "userId",
  "deviceKeyHash" = md5("tokenHash")
WHERE "jti" IS NULL OR "sessionId" IS NULL OR "deviceKeyHash" IS NULL;

-- Set non-null constraints after backfill.
ALTER TABLE "RefreshToken"
ALTER COLUMN "jti" SET NOT NULL,
ALTER COLUMN "sessionId" SET NOT NULL,
ALTER COLUMN "deviceKeyHash" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
