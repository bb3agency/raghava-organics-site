-- Allow coupons to omit per-customer limits
ALTER TABLE "Coupon"
ALTER COLUMN "maxUsesPerUser" DROP NOT NULL,
ALTER COLUMN "maxUsesPerUser" DROP DEFAULT;

-- Persist historical low-stock alerts for reporting
CREATE TABLE "LowStockAlertEvent" (
  "id" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lowStockThreshold" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LowStockAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LowStockAlertEvent_createdAt_idx" ON "LowStockAlertEvent"("createdAt");
CREATE INDEX "LowStockAlertEvent_variantId_createdAt_idx" ON "LowStockAlertEvent"("variantId", "createdAt");

-- Expand store settings to support admin-managed identity/regulatory/notifications
ALTER TABLE "StoreSettings"
ADD COLUMN "storeName" TEXT,
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "gstin" TEXT,
ADD COLUMN "fssaiNumber" TEXT,
ADD COLUMN "notifyEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifySmsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultLowStockThreshold" INTEGER NOT NULL DEFAULT 5;
