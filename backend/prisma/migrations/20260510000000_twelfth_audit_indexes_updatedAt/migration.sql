-- Twelfth audit: add missing FK indexes + ReconciliationIssue.updatedAt

-- 1. ReconciliationIssue: add updatedAt with a safe default for existing rows
ALTER TABLE "ReconciliationIssue" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. CartItem: add updatedAt with a safe default for existing rows
ALTER TABLE "CartItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. ProductImage: add updatedAt with a safe default for existing rows
ALTER TABLE "ProductImage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Missing FK indexes
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
CREATE INDEX "OpsDualApprovalRequest_confirmerId_idx" ON "OpsDualApprovalRequest"("confirmerId");
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

-- 5. Previously missed FK indexes from eleventh audit
CREATE INDEX IF NOT EXISTS "Review_orderId_idx" ON "Review"("orderId");
CREATE INDEX IF NOT EXISTS "Cart_couponId_idx" ON "Cart"("couponId");
