/*
  Warnings:

  - Added the required column `batchId` to the `AssetTransfer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `AssetTransfer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AssetTransfer" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "batchId" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "decisionNotes" TEXT,
ADD COLUMN     "newHolderId" TEXT,
ADD COLUMN     "quantity" DECIMAL(15,4) NOT NULL,
ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AssetTransfer_batchId_idx" ON "AssetTransfer"("batchId");

-- CreateIndex
CREATE INDEX "AssetTransfer_newHolderId_idx" ON "AssetTransfer"("newHolderId");

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_newHolderId_fkey" FOREIGN KEY ("newHolderId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
