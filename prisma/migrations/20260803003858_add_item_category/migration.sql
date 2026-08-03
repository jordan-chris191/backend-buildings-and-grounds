-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_name_key" ON "ItemCategory"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
