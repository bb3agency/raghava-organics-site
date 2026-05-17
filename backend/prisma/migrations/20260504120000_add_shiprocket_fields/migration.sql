-- Migration: add_shiprocket_fields
-- Adds Shiprocket-specific columns to Order and Shipment, and registers the
-- SHIPROCKET value in the ShippingProvider enum.

-- 1. Add SHIPROCKET to the ShippingProvider enum (idempotent guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SHIPROCKET'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'ShippingProvider'
      )
  ) THEN
    ALTER TYPE "ShippingProvider" ADD VALUE 'SHIPROCKET';
  END IF;
END$$;

-- 2. Order: courier selection fields from serviceability check
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "courierCompanyId"  INTEGER,
  ADD COLUMN IF NOT EXISTS "shiprocketOrderId" TEXT;

-- 3. Shipment: Shiprocket-specific tracking and label fields
ALTER TABLE "Shipment"
  ADD COLUMN IF NOT EXISTS "shiprocketShipmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "labelUrl"              TEXT,
  ADD COLUMN IF NOT EXISTS "pickupScheduledDate"   TIMESTAMP(3);

-- 4. Index for fast lookup by Shiprocket shipment ID
CREATE INDEX IF NOT EXISTS "Shipment_shiprocketShipmentId_idx"
  ON "Shipment"("shiprocketShipmentId");
