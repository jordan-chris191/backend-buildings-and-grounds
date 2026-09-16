-- Read-only audit for Phase 2B legacy history migration.
-- Every legacy row should have one migrated batch/line, and source-stock links
-- may be null only where historical campus stock could not be reconstructed.
SELECT
  (SELECT count(*) FROM "AssetTransfer") AS legacy_rows,
  (SELECT count(*) FROM "AssetTransferBatch" WHERE "legacyBatchId" IS NOT NULL) AS migrated_legacy_batches,
  (SELECT count(*) FROM "AssetTransferLine" line JOIN "AssetTransferBatch" batch ON batch.id = line."batchId" WHERE batch."legacyBatchId" IS NOT NULL) AS migrated_legacy_lines,
  (SELECT count(*) FROM "AssetTransferLine" line JOIN "AssetTransferBatch" batch ON batch.id = line."batchId" WHERE batch."legacyBatchId" IS NOT NULL AND line."sourceInventoryStockId" IS NULL) AS unresolved_legacy_source_balances;
