/*
  Warnings:

  - A unique constraint covering the columns `[estimateControlNo]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "acquisitionDate" TIMESTAMP(3),
ADD COLUMN     "totalValue" DECIMAL(65,30),
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitCost" DECIMAL(65,30),
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "estimateControlNo" TEXT;

-- CreateTable
CREATE TABLE "MaterialEstimate" (
    "id" TEXT NOT NULL,
    "category" TEXT,
    "itemNo" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "MaterialEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "controlNo" TEXT NOT NULL,
    "requestingOffice" TEXT NOT NULL,
    "purpose" TEXT,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "totalCost" DECIMAL(65,30) NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "materialEstimateId" TEXT,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequencyDays" INTEGER NOT NULL,
    "lastPerformedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryItemId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialEstimate_projectId_idx" ON "MaterialEstimate"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_controlNo_key" ON "PurchaseRequest"("controlNo");

-- CreateIndex
CREATE INDEX "PurchaseRequest_projectId_idx" ON "PurchaseRequest"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestedById_idx" ON "PurchaseRequest"("requestedById");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_purchaseRequestId_idx" ON "PurchaseRequestItem"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_inventoryItemId_idx" ON "MaintenanceSchedule"("inventoryItemId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_nextDueAt_idx" ON "MaintenanceSchedule"("nextDueAt");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_isActive_idx" ON "MaintenanceSchedule"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_performedById_idx" ON "AuditLog"("performedById");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_estimateControlNo_key" ON "Project"("estimateControlNo");

-- AddForeignKey
ALTER TABLE "MaterialEstimate" ADD CONSTRAINT "MaterialEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_materialEstimateId_fkey" FOREIGN KEY ("materialEstimateId") REFERENCES "MaterialEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
