/*
  Warnings:

  - You are about to drop the column `spentAmount` on the `BudgetAllocation` table. All the data in the column will be lost.
  - You are about to drop the column `totalValue` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `MaterialEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `requestingOffice` on the `PurchaseRequest` table. All the data in the column will be lost.
  - You are about to drop the column `totalCost` on the `PurchaseRequestItem` table. All the data in the column will be lost.
  - You are about to drop the column `assignedToId` on the `WorkRequest` table. All the data in the column will be lost.
  - You are about to drop the column `inventoryItemId` on the `WorkRequest` table. All the data in the column will be lost.
  - You are about to drop the column `requestingOffice` on the `WorkRequest` table. All the data in the column will be lost.
  - You are about to drop the `ItemIssuance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WarehouseWithdrawal` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `role` on the `WorkRequestAssignment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STUDENT', 'STAFF', 'VISITOR', 'EXTERNAL', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ISSUANCE', 'WITHDRAWAL', 'RETURN');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('LEAD', 'MEMBER');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'RETURNED';

-- DropForeignKey
ALTER TABLE "AssetTransfer" DROP CONSTRAINT "AssetTransfer_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "ItemIssuance" DROP CONSTRAINT "ItemIssuance_custodianId_fkey";

-- DropForeignKey
ALTER TABLE "ItemIssuance" DROP CONSTRAINT "ItemIssuance_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceSchedule" DROP CONSTRAINT "MaintenanceSchedule_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialEstimate" DROP CONSTRAINT "MaterialEstimate_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_workRequestId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequestItem" DROP CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "WarehouseWithdrawal" DROP CONSTRAINT "WarehouseWithdrawal_custodianId_fkey";

-- DropForeignKey
ALTER TABLE "WarehouseWithdrawal" DROP CONSTRAINT "WarehouseWithdrawal_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "WorkRequest" DROP CONSTRAINT "WorkRequest_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "WorkRequest" DROP CONSTRAINT "WorkRequest_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "WorkRequestAccomplishment" DROP CONSTRAINT "WorkRequestAccomplishment_workRequestId_fkey";

-- DropForeignKey
ALTER TABLE "WorkRequestAssignment" DROP CONSTRAINT "WorkRequestAssignment_workRequestId_fkey";

-- DropIndex
DROP INDEX "WorkRequest_assignedToId_idx";

-- DropIndex
DROP INDEX "WorkRequest_inventoryItemId_idx";

-- DropIndex
DROP INDEX "WorkRequestAssignment_workRequestId_userId_role_key";

-- AlterTable
ALTER TABLE "AssetTransfer" ADD COLUMN     "status" "TransferStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "BudgetAllocation" DROP COLUMN "spentAmount";

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "totalValue",
ADD COLUMN     "sourcePurchaseRequestId" TEXT;

-- AlterTable
ALTER TABLE "MaterialEstimate" DROP COLUMN "amount";

-- AlterTable
ALTER TABLE "PurchaseRequest" DROP COLUMN "requestingOffice",
ADD COLUMN     "requestingOfficeId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRequestItem" DROP COLUMN "totalCost";

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "purchaseRequestId" TEXT;

-- AlterTable
ALTER TABLE "WorkRequest" DROP COLUMN "assignedToId",
DROP COLUMN "inventoryItemId",
DROP COLUMN "requestingOffice",
ADD COLUMN     "maintenanceScheduleId" TEXT,
ADD COLUMN     "requestingOfficeId" TEXT;

-- AlterTable
ALTER TABLE "WorkRequestAssignment" ADD COLUMN     "unassignedAt" TIMESTAMP(3),
DROP COLUMN "role",
ADD COLUMN     "role" "AssignmentRole" NOT NULL;

-- DropTable
DROP TABLE "ItemIssuance";

-- DropTable
DROP TABLE "WarehouseWithdrawal";

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campus" "Campus" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "studentId" TEXT,
    "contactNumber" TEXT,
    "type" "PersonType" NOT NULL DEFAULT 'EXTERNAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTransaction" (
    "id" TEXT NOT NULL,
    "controlNumber" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "personId" TEXT,
    "custodianId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequestItem" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "description" TEXT,
    "workRequestId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Office_campus_idx" ON "Office"("campus");

-- CreateIndex
CREATE UNIQUE INDEX "Office_name_campus_key" ON "Office"("name", "campus");

-- CreateIndex
CREATE UNIQUE INDEX "Person_studentId_key" ON "Person"("studentId");

-- CreateIndex
CREATE INDEX "Person_studentId_idx" ON "Person"("studentId");

-- CreateIndex
CREATE INDEX "Person_type_idx" ON "Person"("type");

-- CreateIndex
CREATE INDEX "Person_lastName_idx" ON "Person"("lastName");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTransaction_controlNumber_key" ON "ItemTransaction"("controlNumber");

-- CreateIndex
CREATE INDEX "ItemTransaction_inventoryItemId_idx" ON "ItemTransaction"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ItemTransaction_personId_idx" ON "ItemTransaction"("personId");

-- CreateIndex
CREATE INDEX "ItemTransaction_custodianId_idx" ON "ItemTransaction"("custodianId");

-- CreateIndex
CREATE INDEX "ItemTransaction_transactionType_idx" ON "ItemTransaction"("transactionType");

-- CreateIndex
CREATE INDEX "ItemTransaction_transactionDate_idx" ON "ItemTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "ItemTransaction_inventoryItemId_transactionType_idx" ON "ItemTransaction"("inventoryItemId", "transactionType");

-- CreateIndex
CREATE INDEX "WorkRequestItem_workRequestId_idx" ON "WorkRequestItem"("workRequestId");

-- CreateIndex
CREATE INDEX "WorkRequestItem_inventoryItemId_idx" ON "WorkRequestItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "AssetTransfer_status_idx" ON "AssetTransfer"("status");

-- CreateIndex
CREATE INDEX "AssetTransfer_inventoryItemId_status_idx" ON "AssetTransfer"("inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_sourcePurchaseRequestId_idx" ON "InventoryItem"("sourcePurchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestingOfficeId_idx" ON "PurchaseRequest"("requestingOfficeId");

-- CreateIndex
CREATE INDEX "StockMovement_purchaseRequestId_idx" ON "StockMovement"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "WorkRequest_requestingOfficeId_idx" ON "WorkRequest"("requestingOfficeId");

-- CreateIndex
CREATE INDEX "WorkRequest_maintenanceScheduleId_idx" ON "WorkRequest"("maintenanceScheduleId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sourcePurchaseRequestId_fkey" FOREIGN KEY ("sourcePurchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTransaction" ADD CONSTRAINT "ItemTransaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTransaction" ADD CONSTRAINT "ItemTransaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTransaction" ADD CONSTRAINT "ItemTransaction_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_requestingOfficeId_fkey" FOREIGN KEY ("requestingOfficeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestItem" ADD CONSTRAINT "WorkRequestItem_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestItem" ADD CONSTRAINT "WorkRequestItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAssignment" ADD CONSTRAINT "WorkRequestAssignment_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAccomplishment" ADD CONSTRAINT "WorkRequestAccomplishment_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialEstimate" ADD CONSTRAINT "MaterialEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestingOfficeId_fkey" FOREIGN KEY ("requestingOfficeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
