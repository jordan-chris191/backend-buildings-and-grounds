/*
  Warnings:

  - You are about to drop the `RequestCounter` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[propertyNumber]` on the table `InventoryItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[serialNumber]` on the table `InventoryItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "propertyNumber" TEXT,
ADD COLUMN     "serialNumber" TEXT;

-- AlterTable
ALTER TABLE "WorkRequest" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "RequestCounter";

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workRequestId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequestAssignment" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WorkRequestAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemIssuance" (
    "id" TEXT NOT NULL,
    "controlNumber" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "borrowerName" TEXT NOT NULL,
    "studentId" TEXT,
    "contactNumber" TEXT,
    "custodianId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueBackAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "ItemIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseWithdrawal" (
    "id" TEXT NOT NULL,
    "issuanceSlipNo" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "withdrawnByName" TEXT NOT NULL,
    "custodianId" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("type","year")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "WorkRequestAssignment_workRequestId_idx" ON "WorkRequestAssignment"("workRequestId");

-- CreateIndex
CREATE INDEX "WorkRequestAssignment_userId_idx" ON "WorkRequestAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRequestAssignment_workRequestId_userId_role_key" ON "WorkRequestAssignment"("workRequestId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ItemIssuance_controlNumber_key" ON "ItemIssuance"("controlNumber");

-- CreateIndex
CREATE INDEX "ItemIssuance_inventoryItemId_idx" ON "ItemIssuance"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ItemIssuance_custodianId_idx" ON "ItemIssuance"("custodianId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseWithdrawal_issuanceSlipNo_key" ON "WarehouseWithdrawal"("issuanceSlipNo");

-- CreateIndex
CREATE INDEX "WarehouseWithdrawal_inventoryItemId_idx" ON "WarehouseWithdrawal"("inventoryItemId");

-- CreateIndex
CREATE INDEX "WarehouseWithdrawal_custodianId_idx" ON "WarehouseWithdrawal"("custodianId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_propertyNumber_key" ON "InventoryItem"("propertyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_serialNumber_key" ON "InventoryItem"("serialNumber");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAssignment" ADD CONSTRAINT "WorkRequestAssignment_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAssignment" ADD CONSTRAINT "WorkRequestAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIssuance" ADD CONSTRAINT "ItemIssuance_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIssuance" ADD CONSTRAINT "ItemIssuance_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseWithdrawal" ADD CONSTRAINT "WarehouseWithdrawal_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseWithdrawal" ADD CONSTRAINT "WarehouseWithdrawal_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
