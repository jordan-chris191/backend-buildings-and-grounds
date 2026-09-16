-- Phase 2B: campus-aware transfer aggregate.  Do not drop AssetTransfer:
-- it is the immutable historical record used by existing installations.
CREATE TABLE "AssetTransferBatch" (
    "id" TEXT NOT NULL,
    "sourceCampus" "Campus" NOT NULL,
    "destinationCampus" "Campus" NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "transferredById" TEXT NOT NULL,
    "approvedById" TEXT,
    "receivedById" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "newHolderId" TEXT,
    "legacyBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetTransferBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetTransferLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "sourceInventoryStockId" TEXT,
    "quantity" DECIMAL(15,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetTransferLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetTransferLine_batchId_inventoryItemId_key" ON "AssetTransferLine"("batchId", "inventoryItemId");
CREATE INDEX "AssetTransferBatch_status_idx" ON "AssetTransferBatch"("status");
CREATE INDEX "AssetTransferBatch_sourceCampus_idx" ON "AssetTransferBatch"("sourceCampus");
CREATE INDEX "AssetTransferBatch_destinationCampus_idx" ON "AssetTransferBatch"("destinationCampus");
CREATE INDEX "AssetTransferBatch_transferDate_idx" ON "AssetTransferBatch"("transferDate");
CREATE INDEX "AssetTransferBatch_legacyBatchId_idx" ON "AssetTransferBatch"("legacyBatchId");
CREATE INDEX "AssetTransferLine_inventoryItemId_idx" ON "AssetTransferLine"("inventoryItemId");
CREATE INDEX "AssetTransferLine_sourceInventoryStockId_idx" ON "AssetTransferLine"("sourceInventoryStockId");

ALTER TABLE "AssetTransferBatch" ADD CONSTRAINT "AssetTransferBatch_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetTransferBatch" ADD CONSTRAINT "AssetTransferBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransferBatch" ADD CONSTRAINT "AssetTransferBatch_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransferBatch" ADD CONSTRAINT "AssetTransferBatch_newHolderId_fkey" FOREIGN KEY ("newHolderId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransferLine" ADD CONSTRAINT "AssetTransferLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AssetTransferBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTransferLine" ADD CONSTRAINT "AssetTransferLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetTransferLine" ADD CONSTRAINT "AssetTransferLine_sourceInventoryStockId_fkey" FOREIGN KEY ("sourceInventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A legacy batch could contain lines from different sources.  Preserve each
-- old row as its own explicitly sourced batch, retaining old batch identity
-- in legacyBatchId.  No legacy record is changed or deleted.
INSERT INTO "AssetTransferBatch" ("id", "sourceCampus", "destinationCampus", "transferDate", "reason", "transferredById", "approvedById", "receivedById", "status", "approvedAt", "rejectedAt", "completedAt", "decisionNotes", "newHolderId", "legacyBatchId", "createdAt", "updatedAt")
SELECT 'legacy-transfer-' || "id", "fromCampus", "toCampus", "transferDate", "reason", "transferredById", "approvedById", "receivedById", "status", "approvedAt", "rejectedAt", "completedAt", "decisionNotes", "newHolderId", "batchId", "createdAt", "updatedAt"
FROM "AssetTransfer";

INSERT INTO "AssetTransferLine" ("id", "batchId", "inventoryItemId", "sourceInventoryStockId", "quantity", "createdAt", "updatedAt")
SELECT 'legacy-transfer-line-' || transfer."id", 'legacy-transfer-' || transfer."id", transfer."inventoryItemId", stock."id", transfer."quantity", transfer."createdAt", transfer."updatedAt"
FROM "AssetTransfer" transfer
LEFT JOIN "InventoryStock" stock ON stock."inventoryItemId" = transfer."inventoryItemId" AND stock."campus" = transfer."fromCampus";
