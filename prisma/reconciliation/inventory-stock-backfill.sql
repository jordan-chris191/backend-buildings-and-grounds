-- Read-only Phase 2A backfill reconciliation. Every returned row is a problem.
SELECT 'missing_balance' AS issue, i."id" AS inventory_item_id, NULL::text AS campus, i."quantity" AS legacy_quantity, NULL::numeric AS stock_quantity
FROM "InventoryItem" i LEFT JOIN "InventoryStock" s ON s."inventoryItemId" = i."id"
WHERE s."id" IS NULL
UNION ALL
SELECT 'per_item_mismatch', i."id", NULL::text, i."quantity", COALESCE(SUM(s."quantity"), 0)
FROM "InventoryItem" i LEFT JOIN "InventoryStock" s ON s."inventoryItemId" = i."id"
GROUP BY i."id", i."quantity" HAVING i."quantity" <> COALESCE(SUM(s."quantity"), 0)
UNION ALL
SELECT 'duplicate_balance', s."inventoryItemId", s."campus"::text, NULL::numeric, COUNT(*)::numeric
FROM "InventoryStock" s GROUP BY s."inventoryItemId", s."campus" HAVING COUNT(*) > 1
UNION ALL
SELECT 'invalid_balance', s."inventoryItemId", s."campus"::text, s."quantity", s."reservedQuantity"
FROM "InventoryStock" s WHERE s."quantity" < 0 OR s."reservedQuantity" < 0 OR s."reservedQuantity" > s."quantity";

-- Global reconciliation (one row): legacy_total vs authoritative balance_total.
SELECT COALESCE((SELECT SUM("quantity") FROM "InventoryItem"), 0) AS legacy_total,
       COALESCE((SELECT SUM("quantity") FROM "InventoryStock"), 0) AS stock_total;
