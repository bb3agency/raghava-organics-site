-- India D2C compliance: COD, HSN/GST, credit notes, returns, cancellation window, e-invoice, GSTIN

-- New enums
CREATE TYPE "PaymentMode" AS ENUM ('PREPAID', 'COD');
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED');

-- Add COD to PaymentProvider
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'COD';

-- Order: paymentMode
ALTER TABLE "Order" ADD COLUMN "paymentMode" "PaymentMode" NOT NULL DEFAULT 'PREPAID';
CREATE INDEX "Order_paymentMode_idx" ON "Order"("paymentMode");

-- ProductVariant: HSN + GST rate
ALTER TABLE "ProductVariant" ADD COLUMN "hsnCode" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "gstRatePercent" INTEGER NOT NULL DEFAULT 0;

-- Address: GSTIN for B2B
ALTER TABLE "Address" ADD COLUMN "gstin" TEXT;

-- Invoice: GST breakdown, e-invoice fields
ALTER TABLE "Invoice" ADD COLUMN "gstBreakdown" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "irnNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "einvoiceQrUrl" TEXT;

-- StoreSettings: COD toggle, cancellation window, seller state
ALTER TABLE "StoreSettings" ADD COLUMN "isCodEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSettings" ADD COLUMN "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "StoreSettings" ADD COLUMN "sellerState" TEXT;

-- CreditNote model
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");
CREATE INDEX "CreditNote_orderId_idx" ON "CreditNote"("orderId");
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ReturnRequest model
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_userId_idx" ON "ReturnRequest"("userId");
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
