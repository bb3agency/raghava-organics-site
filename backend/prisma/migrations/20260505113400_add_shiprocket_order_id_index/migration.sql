-- Migration: add_shiprocket_order_id_index
-- Adds an index on Order.shiprocketOrderId for fast lookup when correlating
-- with Shiprocket dashboard order references.

CREATE INDEX IF NOT EXISTS "Order_shiprocketOrderId_idx"
  ON "Order"("shiprocketOrderId");
