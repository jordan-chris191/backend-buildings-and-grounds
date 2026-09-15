import { Campus, ItemStatus, ItemType, Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryLedgerService } from '../src/stock-movements/inventory-ledger.service';
import { BorrowRequestsService } from '../src/borrow-requests/borrow-requests.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { InventoryService } from '../src/inventory/inventory.service';

const prisma = new PrismaService();
const ledger = new InventoryLedgerService();
let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks += 1;
}

async function expectFailure(action: () => Promise<unknown>) {
  let failed = false;
  try { await action(); } catch { failed = true; }
  if (!failed) throw new Error('expected operation to fail');
}

async function createItem(name: string) {
  return prisma.inventoryItem.create({
    data: { name: `${name}-${Date.now()}-${Math.random()}`, type: ItemType.CONSUMABLE, campus: Campus.MC1, quantity: new Prisma.Decimal(0) },
  });
}

async function createBalances(itemId: string, mc1Quantity: number, mc1Reserved: number, mc2Quantity: number, mc2Reserved: number) {
  return prisma.$transaction([
    prisma.inventoryStock.create({ data: { inventoryItemId: itemId, campus: Campus.MC1, quantity: new Prisma.Decimal(mc1Quantity), reservedQuantity: new Prisma.Decimal(mc1Reserved) } }),
    prisma.inventoryStock.create({ data: { inventoryItemId: itemId, campus: Campus.MC2, quantity: new Prisma.Decimal(mc2Quantity), reservedQuantity: new Prisma.Decimal(mc2Reserved) } }),
  ]);
}

async function main() {
  await prisma.$connect();
  const role = await prisma.role.upsert({ where: { name: 'phase2a-test-role' }, update: {}, create: { name: 'phase2a-test-role' } });
  const user = await prisma.user.upsert({ where: { email: 'phase2a-test@example.invalid' }, update: {}, create: { email: 'phase2a-test@example.invalid', passwordHash: 'x', firstName: 'Phase', lastName: 'Test', roleId: role.id } });
  const auditEvents: any[] = [];
  const audit: any = { log(data: any) { auditEvents.push(data); return Promise.resolve(); } };
  const lifecycle = new InventoryService(prisma, audit, { notifyInventoryUpdate() {} } as any, ledger);

  const item = await createItem('phase2a');
  const [mc1, mc2] = await createBalances(item.id, 10, 0, 20, 0);
  await prisma.$transaction((tx) => ledger.apply(tx, { inventoryItemId: item.id, campus: Campus.MC1, quantityChange: new Prisma.Decimal(-4), movementType: StockMovementType.WITHDRAWN, performedById: user.id }));
  let stocks = await prisma.inventoryStock.findMany({ where: { inventoryItemId: item.id }, orderBy: { campus: 'asc' } });
  check(stocks.find(s => s.id === mc1.id)?.quantity.toNumber() === 6 && stocks.find(s => s.id === mc2.id)?.quantity.toNumber() === 20, 'campus isolation failed');
  const movement = await prisma.stockMovement.findFirstOrThrow({ where: { inventoryStockId: mc1.id }, orderBy: { createdAt: 'desc' } });
  check(movement.campus === Campus.MC1, 'movement provenance failed');
  await prisma.inventoryStock.update({ where: { id: mc1.id }, data: { quantity: new Prisma.Decimal(10) } });
  const results = await Promise.allSettled([8, 8].map(amount => prisma.$transaction(tx => ledger.apply(tx, { inventoryItemId: item.id, campus: Campus.MC1, quantityChange: new Prisma.Decimal(-amount), movementType: StockMovementType.WITHDRAWN, performedById: user.id }))));
  check(results.filter(r => r.status === 'fulfilled').length === 1, 'conditional concurrent withdrawal failed');
  await prisma.$transaction(tx => ledger.reserve(tx, item.id, Campus.MC2, new Prisma.Decimal(8)));
  await prisma.$transaction(tx => ledger.releaseReservation(tx, item.id, Campus.MC2, new Prisma.Decimal(3)));
  await prisma.$transaction(tx => ledger.consumeReservation(tx, item.id, Campus.MC2, new Prisma.Decimal(5)));
  const finalMc2 = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: item.id, campus: Campus.MC2 } } });
  check(finalMc2.quantity.toNumber() === 15 && finalMc2.reservedQuantity.toNumber() === 0, 'reservation lifecycle failed');

  const borrow = new BorrowRequestsService(prisma, audit, { notifyUser() {} } as any, { create() { return Promise.resolve(); } } as any, ledger);
  const borrowItem = await createItem('borrow');
  const [b1] = await createBalances(borrowItem.id, 10, 0, 20, 0);
  const request = await borrow.create(user.id, { inventoryItemId: borrowItem.id, campus: Campus.MC1, quantity: 3 });
  await borrow.approve(request.id, user.id, {} as any);
  const persistedBorrow = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } });
  const borrowMc2 = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: borrowItem.id, campus: Campus.MC2 } } });
  check(persistedBorrow.inventoryStockId === b1.id && persistedBorrow.campus === Campus.MC1 && borrowMc2.quantity.toNumber() === 20, 'borrow provenance failed');

  const transactions = new TransactionsService(prisma, audit, ledger);
  const txItem = await createItem('transaction');
  const [t1, t2] = await createBalances(txItem.id, 10, 0, 20, 0);
  const transaction = await transactions.create(user.id, { inventoryItemId: txItem.id, campus: Campus.MC2, quantity: 4, transactionType: 'WITHDRAWAL' as any });
  const afterT1 = await prisma.inventoryStock.findUniqueOrThrow({ where: { id: t1.id } });
  const afterT2 = await prisma.inventoryStock.findUniqueOrThrow({ where: { id: t2.id } });
  check(transaction.inventoryStockId === t2.id && transaction.campus === Campus.MC2 && afterT1.quantity.toNumber() === 10 && afterT2.quantity.toNumber() === 16, 'transaction provenance failed');

  const archivePositive = await createItem('archive-positive');
  await createBalances(archivePositive.id, 0, 0, 5, 0);
  await expectFailure(() => lifecycle.remove(archivePositive.id, user.id));
  check((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: archivePositive.id } })).isActive, 'archive with positive stock changed item state');

  const archiveReserved = await createItem('archive-reserved');
  await createBalances(archiveReserved.id, 0, 0, 5, 2);
  const archiveStocksBefore = await prisma.inventoryStock.findMany({ where: { inventoryItemId: archiveReserved.id }, orderBy: { campus: 'asc' } });
  const archiveMovementsBefore = await prisma.stockMovement.count({ where: { inventoryItemId: archiveReserved.id } });
  const archiveAuditsBefore = auditEvents.filter(event => event.action === 'ARCHIVE' && event.entityId === archiveReserved.id).length;
  await expectFailure(() => lifecycle.remove(archiveReserved.id, user.id));
  const archiveState = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: archiveReserved.id } });
  const archiveStocksAfter = await prisma.inventoryStock.findMany({ where: { inventoryItemId: archiveReserved.id }, orderBy: { campus: 'asc' } });
  check(archiveState.isActive && archiveStocksAfter.every((stock, index) => stock.quantity.eq(archiveStocksBefore[index].quantity) && stock.reservedQuantity.eq(archiveStocksBefore[index].reservedQuantity)) && (await prisma.stockMovement.count({ where: { inventoryItemId: archiveReserved.id } })) === archiveMovementsBefore && auditEvents.filter(event => event.action === 'ARCHIVE' && event.entityId === archiveReserved.id).length === archiveAuditsBefore, 'archive with reservation changed state, balances, audit, or movements');
  await prisma.inventoryStock.updateMany({ where: { inventoryItemId: archiveReserved.id }, data: { quantity: new Prisma.Decimal(0), reservedQuantity: new Prisma.Decimal(0) } });
  await lifecycle.remove(archiveReserved.id, user.id);
  check(!(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: archiveReserved.id } })).isActive, 'empty archive failed');

  const disposalPositive = await createItem('disposal-positive');
  await createBalances(disposalPositive.id, 0, 0, 5, 0);
  await expectFailure(() => lifecycle.updateStatus(disposalPositive.id, ItemStatus.DISPOSED, user.id));
  check((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: disposalPositive.id } })).isActive, 'disposal with positive stock changed item state');

  const disposalReserved = await createItem('disposal-reserved');
  await createBalances(disposalReserved.id, 0, 0, 5, 2);
  await expectFailure(() => lifecycle.updateStatus(disposalReserved.id, ItemStatus.DISPOSED, user.id));
  check((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: disposalReserved.id } })).isActive, 'disposal with reserved stock changed item state');

  const disposalEmpty = await createItem('disposal-empty');
  const disposalBalances = await createBalances(disposalEmpty.id, 0, 0, 0, 0);
  const disposalMovementsBefore = await prisma.stockMovement.count({ where: { inventoryItemId: disposalEmpty.id } });
  await lifecycle.updateStatus(disposalEmpty.id, ItemStatus.DISPOSED, user.id);
  const disposedState = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: disposalEmpty.id } });
  const persistedBalances = await prisma.inventoryStock.findMany({ where: { inventoryItemId: disposalEmpty.id }, orderBy: { campus: 'asc' } });
  check(!disposedState.isActive && disposedState.status === ItemStatus.DISPOSED && persistedBalances.length === 2 && persistedBalances.every(stock => stock.quantity.isZero() && stock.reservedQuantity.isZero()) && persistedBalances.every(stock => disposalBalances.some(original => original.id === stock.id)) && (await prisma.stockMovement.count({ where: { inventoryItemId: disposalEmpty.id } })) === disposalMovementsBefore, 'empty disposal changed balances, fabricated a movement, or removed historical balances');

  await expectFailure(() => prisma.$transaction(tx => ledger.deactivateBalance(tx, txItem.id, Campus.MC1)));
  await prisma.inventoryStock.update({ where: { id: t1.id }, data: { quantity: new Prisma.Decimal(0) } });
  await prisma.$transaction(tx => ledger.deactivateBalance(tx, txItem.id, Campus.MC1));
  check(!(await prisma.inventoryStock.findUniqueOrThrow({ where: { id: t1.id } })).isActive, 'balance deactivation failed');

  const apiItem = await createItem('api-balances');
  await createBalances(apiItem.id, 10, 2, 20, 0);
  const apiResponse: any = await lifecycle.findOne(apiItem.id);
  const apiMc1 = apiResponse.inventoryStocks.find((stock: any) => stock.campus === Campus.MC1);
  const apiMc2 = apiResponse.inventoryStocks.find((stock: any) => stock.campus === Campus.MC2);
  check(apiResponse.inventoryStocks.length === 2 && apiMc1?.quantity === 10 && apiMc1?.reservedQuantity === 2 && apiMc1?.availableQuantity === 8 && apiMc2?.quantity === 20 && apiMc2?.reservedQuantity === 0 && apiMc2?.availableQuantity === 20, 'API balance representation failed');

  console.log(`phase2a postgres ledger integration passed: ${checks}/14 assertions`);
  await prisma.$disconnect();
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
