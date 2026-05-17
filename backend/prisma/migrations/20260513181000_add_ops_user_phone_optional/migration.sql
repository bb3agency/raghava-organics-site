-- AlterTable
ALTER TABLE "OpsUser" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OpsUser_phone_key" ON "OpsUser"("phone");
