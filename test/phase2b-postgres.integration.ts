import { Campus, ItemType, Prisma, TransferStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryLedgerService } from '../src/stock-movements/inventory-ledger.service';
import { AssetTransfersService } from '../src/asset-transfers/asset-transfers.service';

const prisma = new PrismaService();
const ledger = new InventoryLedgerService();
let checks = 0;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks += 1; }
async function fails(action: () => Promise<unknown>) { try { await action(); } catch { return; } throw new Error('expected failure'); }

async function main() {
  await prisma.$connect();
  const role = await prisma.role.upsert({ where: { name: 'phase2b-test-role' }, update: {}, create: { name: 'phase2b-test-role' } });
  const user = await prisma.user.upsert({ where: { email: 'phase2b-test@example.invalid' }, update: {}, create: { email: 'phase2b-test@example.invalid', passwordHash: 'x', firstName: 'Phase', lastName: 'Transfer', roleId: role.id } });
  const service = new AssetTransfersService(prisma, { log: () => Promise.resolve() } as any, ledger);
  const item = await prisma.inventoryItem.create({ data: { name: `phase2b-${Date.now()}`, type: ItemType.CONSUMABLE, campus: Campus.PAMPLONA, quantity: new Prisma.Decimal(999) } });
  await prisma.inventoryStock.create({ data: { inventoryItemId: item.id, campus: Campus.MC1, quantity: 10 } });

  await fails(() => service.createBatch(user.id, { sourceCampus: Campus.MC1, destinationCampus: Campus.MC2, items: [{ inventoryItemId: item.id, quantity: 1 }, { inventoryItemId: item.id, quantity: 1 }] }));
  checks += 1;
  const rejected = await service.createBatch(user.id, { sourceCampus: Campus.MC1, destinationCampus: Campus.MC2, items: [{ inventoryItemId: item.id, quantity: 3 }] });
  await service.approveBatch(rejected.batchId, user.id, {});
  let source = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: item.id, campus: Campus.MC1 } } });
  check(source.quantity.eq(10) && source.reservedQuantity.eq(3), 'approval did not reserve source stock');
  await service.rejectBatch(rejected.batchId, user.id, {});
  source = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: item.id, campus: Campus.MC1 } } });
  check(source.reservedQuantity.isZero() && (await prisma.assetTransferBatch.findUniqueOrThrow({ where: { id: rejected.batchId } })).status === TransferStatus.REJECTED, 'rejection did not release reservation');

  const received = await service.createBatch(user.id, { sourceCampus: Campus.MC1, destinationCampus: Campus.MC2, items: [{ inventoryItemId: item.id, quantity: 4 }] });
  await service.approveBatch(received.batchId, user.id, {});
  await service.receiveBatch(received.batchId, user.id);
  source = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: item.id, campus: Campus.MC1 } } });
  const destination = await prisma.inventoryStock.findUniqueOrThrow({ where: { inventoryItemId_campus: { inventoryItemId: item.id, campus: Campus.MC2 } } });
  const movements = await prisma.stockMovement.findMany({ where: { referenceType: 'AssetTransferBatch', referenceId: received.batchId } });
  check(source.quantity.eq(6) && source.reservedQuantity.isZero() && destination.quantity.eq(4), 'receipt did not consume source reservation and increment destination');
  check(movements.length === 2 && movements.some(m => m.campus === Campus.MC1 && m.quantityChange.eq(-4)) && movements.some(m => m.campus === Campus.MC2 && m.quantityChange.eq(4)), 'transfer movements lack campus balance provenance');
  check((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).campus === Campus.PAMPLONA, 'transfer used InventoryItem.campus as live location');

  const concurrent = await service.createBatch(user.id, { sourceCampus: Campus.MC1, destinationCampus: Campus.MC2, items: [{ inventoryItemId: item.id, quantity: 1 }] });
  const results = await Promise.allSettled([service.approveBatch(concurrent.batchId, user.id, {}), service.approveBatch(concurrent.batchId, user.id, {})]);
  check(results.filter(result => result.status === 'fulfilled').length === 1, 'concurrent approvals were not state-safe');
  console.log(`phase2b postgres transfer integration passed: ${checks}/7 assertions`);
  await prisma.$disconnect();
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
