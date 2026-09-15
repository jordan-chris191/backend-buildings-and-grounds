-- InventoryItem.quantity is retained as a legacy compatibility snapshot only.
-- All live quantity mutations use InventoryStock.
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "campus" "Campus" NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryStock_quantity_nonnegative" CHECK ("quantity" >= 0),
    CONSTRAINT "InventoryStock_reserved_nonnegative" CHECK ("reservedQuantity" >= 0),
    CONSTRAINT "InventoryStock_reserved_not_over_quantity" CHECK ("reservedQuantity" <= "quantity")
);

CREATE UNIQUE INDEX "InventoryStock_inventoryItemId_campus_key" ON "InventoryStock"("inventoryItemId", "campus");
CREATE INDEX "InventoryStock_campus_idx" ON "InventoryStock"("campus");
CREATE INDEX "InventoryStock_isActive_idx" ON "InventoryStock"("isActive");

INSERT INTO "InventoryStock" ("id", "inventoryItemId", "campus", "quantity", "reservedQuantity", "isActive", "createdAt", "updatedAt")
SELECT 'stock-' || md5(random()::text || clock_timestamp()::text || "id"), "id", "campus", "quantity", 0, "isActive", "createdAt", "updatedAt"
FROM "InventoryItem";

ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD COLUMN "inventoryStockId" TEXT,
ADD COLUMN "campus" "Campus";

UPDATE "StockMovement" sm
SET "inventoryStockId" = stock."id", "campus" = stock."campus"
FROM "InventoryStock" stock
WHERE stock."inventoryItemId" = sm."inventoryItemId";

CREATE INDEX "StockMovement_inventoryStockId_idx" ON "StockMovement"("inventoryStockId");
CREATE INDEX "StockMovement_campus_idx" ON "StockMovement"("campus");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryStockId_fkey"
  FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ItemTransaction" ADD COLUMN "inventoryStockId" TEXT, ADD COLUMN "campus" "Campus";
ALTER TABLE "BorrowRequest" ADD COLUMN "inventoryStockId" TEXT, ADD COLUMN "campus" "Campus";
UPDATE "ItemTransaction" t SET "inventoryStockId" = s."id", "campus" = s."campus" FROM "InventoryStock" s WHERE s."inventoryItemId" = t."inventoryItemId";
UPDATE "BorrowRequest" b SET "inventoryStockId" = s."id", "campus" = s."campus" FROM "InventoryStock" s WHERE s."inventoryItemId" = b."inventoryItemId";
CREATE INDEX "ItemTransaction_inventoryStockId_idx" ON "ItemTransaction"("inventoryStockId");
CREATE INDEX "ItemTransaction_campus_idx" ON "ItemTransaction"("campus");
CREATE INDEX "BorrowRequest_inventoryStockId_idx" ON "BorrowRequest"("inventoryStockId");
CREATE INDEX "BorrowRequest_campus_idx" ON "BorrowRequest"("campus");
ALTER TABLE "ItemTransaction" ADD CONSTRAINT "ItemTransaction_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
