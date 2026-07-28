-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('CONSUMABLE', 'ASSET', 'TOOL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('REGULAR_MAINTENANCE', 'REPAIR', 'FABRICATION', 'INSTALLATION', 'REPLACEMENT', 'PLAN_DESIGN', 'BAYANIHAN', 'OTHERS');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'ONGOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequest" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "requestingOffice" TEXT NOT NULL,
    "particulars" TEXT,
    "details" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "inventoryItemId" TEXT,

    CONSTRAINT "WorkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequestAccomplishment" (
    "id" TEXT NOT NULL,
    "dateTimeStarted" TIMESTAMP(3),
    "dateTimeCompleted" TIMESTAMP(3),
    "completionDetails" JSONB,
    "serviceRating" INTEGER,
    "expectationRating" INTEGER,
    "comments" TEXT,
    "workRequestId" TEXT NOT NULL,
    "bgPersonnelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkRequestAccomplishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCounter" (
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequestCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "InventoryItem_projectId_idx" ON "InventoryItem"("projectId");

-- CreateIndex
CREATE INDEX "InventoryItem_type_idx" ON "InventoryItem"("type");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRequest_referenceNo_key" ON "WorkRequest"("referenceNo");

-- CreateIndex
CREATE INDEX "WorkRequest_requestedById_idx" ON "WorkRequest"("requestedById");

-- CreateIndex
CREATE INDEX "WorkRequest_assignedToId_idx" ON "WorkRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "WorkRequest_status_idx" ON "WorkRequest"("status");

-- CreateIndex
CREATE INDEX "WorkRequest_inventoryItemId_idx" ON "WorkRequest"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRequestAccomplishment_workRequestId_key" ON "WorkRequestAccomplishment"("workRequestId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAccomplishment" ADD CONSTRAINT "WorkRequestAccomplishment_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequestAccomplishment" ADD CONSTRAINT "WorkRequestAccomplishment_bgPersonnelId_fkey" FOREIGN KEY ("bgPersonnelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
