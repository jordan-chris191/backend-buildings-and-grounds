# Phase 2A Handoff

## Current repository state

- Branch: `main`
- HEAD: `f4c1bc8 feat(inventory): add campus-specific stock balances`
- Tracking: `main...origin/main` (in sync when this handoff was created)
- Git status before creating this uncommitted handoff: clean.
- This handoff is intentionally uncommitted and must not be committed or pushed unless explicitly requested.

## Phase status

Phase 1 (transactional stock integrity) is complete. Its commit is `0769926 fix(inventory): enforce transactional stock integrity`; it is an ancestor of `origin/main`, so it has been pushed as part of the current branch history.

Phase 2A is complete and committed in `f4c1bc8`. Its objective was to make `InventoryStock`, keyed by inventory item and campus, the authoritative live stock balance while retaining `InventoryItem.quantity` only for backwards compatibility, migration, and fallback reads.

## Implemented Phase 2A work

- Added per-campus `InventoryStock` balances and campus provenance for stock movements, item transactions, and borrow requests.
- Changed stock availability, borrowing, transactions, reports, archive/disposal validation, and transfer availability checks to use balances rather than `InventoryItem.quantity`.
- Added API mapping that returns each authoritative `inventoryStocks` entry with `campus`, `quantity`, `reservedQuantity`, and `availableQuantity`.
- Added database migration, backfill, constraints, reconciliation SQL, unit coverage, and PostgreSQL integration coverage.

### Prisma/schema design

`InventoryStock` has `inventoryItemId`, `campus`, `quantity`, `reservedQuantity`, `isActive`, timestamps, and a unique constraint on `[inventoryItemId, campus]`.

Database invariants are:

- `quantity >= 0`
- `reservedQuantity >= 0`
- `reservedQuantity <= quantity`
- one balance per item/campus

`StockMovement`, `ItemTransaction`, and `BorrowRequest` have optional `inventoryStockId` and `campus` provenance fields with indexes and foreign keys.

### InventoryLedgerService

`src/stock-movements/inventory-ledger.service.ts` is the live mutation authority. It:

- applies conditional, campus-scoped increments/decrements;
- rejects decrements that exceed available quantity (`quantity - reservedQuantity`);
- writes a matching `StockMovement` with balance and campus provenance;
- reserves, releases, and consumes reservations atomically;
- rejects unavailable, inactive, missing, or archived balances appropriately; and
- deactivates only balances that are both zero and unreserved.

### Reservation semantics

- Available quantity is `quantity - reservedQuantity`.
- Reservation increases `reservedQuantity` only when sufficient available stock exists.
- Release reduces an existing reservation.
- Consumption reduces both `quantity` and `reservedQuantity`.
- A zero-quantity balance cannot carry a positive reservation because that violates the database constraint.

### Borrow and transaction provenance

Borrow requests select and store the requested campus balance; approvals use the ledger at that campus. Item transactions likewise record their `inventoryStockId` and `campus`, and withdrawals/returns apply through the ledger at the recorded campus.

### Archive and disposal rules

Archive and disposal reject if any balance for the item has positive `quantity` or `reservedQuantity`. Rejection leaves the item and balances unchanged, makes no successful lifecycle audit entry, and creates no movement. When all balances are zero/unreserved, archive or disposal succeeds without fabricating a withdrawal or deleting historical `InventoryStock` rows.

### Deprecated InventoryItem.quantity

`InventoryItem.quantity` remains a deprecated compatibility snapshot. Allowed uses are schema compatibility, migration/backfill, reconciliation SQL, seed compatibility, and the API fallback for legacy rows without balances. It is not authoritative for live availability, borrowing, transactions, stock movements, reports, lifecycle checks, or transfers.

## Migration and reconciliation

- Migration: `prisma/migrations/20260916000000_add_inventory_stock_balances/migration.sql`
- The migration creates `InventoryStock`, backfills one row per legacy item at the item campus, adds invariants/provenance columns, and preserves the legacy quantity column.
- Read-only reconciliation SQL: `prisma/reconciliation/inventory-stock-backfill.sql`
- PostgreSQL integration harness: `test/phase2a-postgres.integration.ts`

## Completed verification

- `npx prisma migrate status`: database schema up to date.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Targeted Phase 1/2A unit tests: 4 suites, 16 tests passed.
- PostgreSQL harness: 14/14 assertions passed. It covers campus isolation, conditional concurrency, reservation lifecycle, borrow/transaction provenance, positive/reserved archive and disposal rejection, successful empty lifecycle operations, balance deactivation, no artificial disposal movement, retained balance history, and two-campus API representation.
- `git diff --check`: passed.
- Check-only ESLint completed with no findings. Do not use `npm run lint` for verification-only work because that script includes `--fix`.

### Known unrelated test failures

`npm test -- --runInBand` reports 49/51 tests passing, with only these two pre-existing auth smoke-test failures:

- `src/auth/auth.controller.spec.ts` lacks an `AuthService` test provider.
- `src/auth/auth.service.spec.ts` lacks providers including `PrismaService`.

These are not caused by Phase 2A and were explicitly accepted during validation.

## Dedicated PostgreSQL test database

- Host: `localhost`
- Port: `32768`
- Database: `nbgms_test`
- Container: `nbgms-test-postgres`

Use only this database for destructive validation. `localhost:5432/nbgms` is the normal development database and must never be used for destructive validation.

## Phase 2A tasks status

The following requested items are complete, not remaining:

- archive-with-reservation integration test;
- disposal-positive-stock integration test;
- disposal-with-reservation integration test;
- successful disposal integration test;
- authoritative API `inventoryStocks` representation integration test;
- final PostgreSQL harness run; and
- final TypeScript/build/test verification.

## Exact resume commands

```bash
DATABASE_URL='postgresql://nbgms_test:nbgms_test@localhost:32768/nbgms_test' npx prisma migrate status
DATABASE_URL='postgresql://nbgms_test:nbgms_test@localhost:32768/nbgms_test' npx prisma validate
DATABASE_URL='postgresql://nbgms_test:nbgms_test@localhost:32768/nbgms_test' npx prisma generate
npx tsc --noEmit
npm run build
npx jest inventory/inventory.service.spec.ts stock-movements/inventory-ledger.service.spec.ts stock-movements/stock-movements.controller.spec.ts borrow-requests/borrow-requests.service.spec.ts --runInBand
DATABASE_URL='postgresql://nbgms_test:nbgms_test@localhost:32768/nbgms_test' npx tsx test/phase2a-postgres.integration.ts
npm test -- --runInBand
git diff --check
git status -sb
```

## SAFE TO COMMIT criteria

Phase 2A is safe to commit only when the schema is valid/generated, TypeScript and build pass, targeted tests pass, the PostgreSQL harness passes all 14 assertions against `localhost:32768/nbgms_test`, `git diff --check` passes, and no unapproved changes or Phase 2B implementation are present. The two documented auth smoke-test failures may remain unchanged.

## Phase 2B — NOT STARTED

- AssetTransferBatch / AssetTransferLine redesign
- transfer approval reservations
- source/destination InventoryStock movement
- duplicate transfer-line prevention
- approval/receipt concurrency protection
- transfer history/provenance

## NEXT SESSION START HERE

1. Read this file and run `git status -sb`; do not assume the working tree remains clean.
2. Confirm the dedicated test DB is `localhost:32768/nbgms_test` and never substitute port 5432.
3. If Phase 2A changes are requested, re-run the exact verification commands above before declaring a verdict.
4. Do not start Phase 2B unless the user explicitly authorizes it.
