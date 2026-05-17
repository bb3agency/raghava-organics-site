/*
  Warnings:

  - You are about to drop the column `search_vector` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "product_search_vector_gin_idx";

-- AlterTable
ALTER TABLE "AdminUserInvite" ALTER COLUMN "permissions" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OpsUser" ALTER COLUMN "ipAllowlist" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OpsUserInvite" ALTER COLUMN "ipAllowlist" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "search_vector";

-- AlterTable
ALTER TABLE "ProductImage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ReconciliationIssue" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "_CouponToOrder" ADD CONSTRAINT "_CouponToOrder_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CouponToOrder_AB_unique";

-- CreateIndex
CREATE INDEX "RefreshToken_jti_idx" ON "RefreshToken"("jti");
