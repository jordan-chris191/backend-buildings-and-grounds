/*
  Warnings:

  - You are about to alter the column `quantity` on the `InventoryItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(15,4)`.
  - You are about to alter the column `totalValue` on the `InventoryItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `unitCost` on the `InventoryItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `quantity` on the `MaterialEstimate` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(15,4)`.
  - You are about to alter the column `unitCost` on the `MaterialEstimate` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `amount` on the `MaterialEstimate` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `quantity` on the `PurchaseRequestItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(15,4)`.
  - You are about to alter the column `unitCost` on the `PurchaseRequestItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `totalCost` on the `PurchaseRequestItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,4)`.
  - You are about to alter the column `quantityChange` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(15,4)`.
  - You are about to alter the column `quantityAfter` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(15,4)`.
  - Added the required column `updatedAt` to the `ItemCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ItemIssuance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MaterialEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Position` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `PurchaseRequestItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SequenceCounter` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `movementType` on the `StockMovement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `WarehouseWithdrawal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `WorkRequestAccomplishment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Trade" AS ENUM ('CARPENTRY', 'ELECTRICAL', 'PLUMBING', 'MASONRY', 'PAINTING', 'METALWORK', 'GENERAL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVED', 'WITHDRAWN', 'ADJUSTED');

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_projectId_fkey";

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4),
ALTER COLUMN "totalValue" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ItemCategory" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ItemIssuance" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "MaterialEstimate" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "budgetAllocationId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseRequestItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "totalCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SequenceCounter" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "movementType",
ADD COLUMN     "movementType" "StockMovementType" NOT NULL,
ALTER COLUMN "quantityChange" SET DATA TYPE DECIMAL(15,4),
ALTER COLUMN "quantityAfter" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "WarehouseWithdrawal" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "WorkRequest" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkRequestAccomplishment" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "AnnualBudget" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" "Trade" NOT NULL,
    "allocatedAmount" DECIMAL(19,4) NOT NULL,
    "spentAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "annualBudgetId" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransfer" (
    "id" TEXT NOT NULL,
    "fromCampus" "Campus" NOT NULL,
    "toCampus" "Campus" NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "transferredById" TEXT NOT NULL,
    "approvedById" TEXT,
    "receivedById" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualBudget_year_key" ON "AnnualBudget"("year");

-- CreateIndex
CREATE INDEX "BudgetAllocation_annualBudgetId_idx" ON "BudgetAllocation"("annualBudgetId");

-- CreateIndex
CREATE INDEX "BudgetAllocation_projectId_idx" ON "BudgetAllocation"("projectId");

-- CreateIndex
CREATE INDEX "BudgetAllocation_trade_idx" ON "BudgetAllocation"("trade");

-- CreateIndex
CREATE INDEX "AssetTransfer_inventoryItemId_idx" ON "AssetTransfer"("inventoryItemId");

-- CreateIndex
CREATE INDEX "AssetTransfer_fromCampus_idx" ON "AssetTransfer"("fromCampus");

-- CreateIndex
CREATE INDEX "AssetTransfer_toCampus_idx" ON "AssetTransfer"("toCampus");

-- CreateIndex
CREATE INDEX "AssetTransfer_transferDate_idx" ON "AssetTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_campus_idx" ON "InventoryItem"("campus");

-- CreateIndex
CREATE INDEX "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_isActive_nextDueAt_idx" ON "MaintenanceSchedule"("isActive", "nextDueAt");

-- CreateIndex
CREATE INDEX "Project_campus_idx" ON "Project"("campus");

-- CreateIndex
CREATE INDEX "Project_isActive_idx" ON "Project"("isActive");

-- CreateIndex
CREATE INDEX "PurchaseRequest_budgetAllocationId_idx" ON "PurchaseRequest"("budgetAllocationId");

-- CreateIndex
CREATE INDEX "WorkRequest_campus_idx" ON "WorkRequest"("campus");

-- CreateIndex
CREATE INDEX "WorkRequest_requestType_idx" ON "WorkRequest"("requestType");

-- CreateIndex
CREATE INDEX "WorkRequest_deadline_idx" ON "WorkRequest"("deadline");

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_annualBudgetId_fkey" FOREIGN KEY ("annualBudgetId") REFERENCES "AnnualBudget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_budgetAllocationId_fkey" FOREIGN KEY ("budgetAllocationId") REFERENCES "BudgetAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
