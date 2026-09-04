/*
  Warnings:

  - You are about to drop the column `sourcePurchaseRequestId` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseRequestId` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the `AnnualBudget` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BudgetAllocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaterialEstimate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseRequestItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BudgetAllocation" DROP CONSTRAINT "BudgetAllocation_annualBudgetId_fkey";

-- DropForeignKey
ALTER TABLE "BudgetAllocation" DROP CONSTRAINT "BudgetAllocation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_sourcePurchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialEstimate" DROP CONSTRAINT "MaterialEstimate_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_budgetAllocationId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_requestingOfficeId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequestItem" DROP CONSTRAINT "PurchaseRequestItem_materialEstimateId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequestItem" DROP CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_purchaseRequestId_fkey";

-- DropIndex
DROP INDEX "InventoryItem_sourcePurchaseRequestId_idx";

-- DropIndex
DROP INDEX "StockMovement_purchaseRequestId_idx";

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "sourcePurchaseRequestId";

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "purchaseRequestId";

-- DropTable
DROP TABLE "AnnualBudget";

-- DropTable
DROP TABLE "BudgetAllocation";

-- DropTable
DROP TABLE "MaterialEstimate";

-- DropTable
DROP TABLE "PurchaseRequest";

-- DropTable
DROP TABLE "PurchaseRequestItem";

-- DropEnum
DROP TYPE "PurchaseRequestStatus";
