/*
  Warnings:

  - Added the required column `chainHash` to the `CouponAuditLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CouponAuditLog" ADD COLUMN     "chainHash" TEXT NOT NULL,
ADD COLUMN     "previousChainHash" TEXT;

-- CreateIndex
CREATE INDEX "CouponAuditLog_chainHash_idx" ON "CouponAuditLog"("chainHash");
