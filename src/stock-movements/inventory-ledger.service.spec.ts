import { BadRequestException } from '@nestjs/common';
import { Campus, Prisma, StockMovementType } from '@prisma/client';
import { InventoryLedgerService } from './inventory-ledger.service';

describe('InventoryLedgerService', () => {
  const tx: any = {
    $queryRaw: jest.fn(), inventoryItem: { findUnique: jest.fn() },
    inventoryStock: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() }, stockMovement: { create: jest.fn() },
  };
  const service = new InventoryLedgerService();
  beforeEach(() => {
    jest.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 'stock-1' }]);
    tx.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: 'stock-1', inventoryItemId: 'item-1', campus: Campus.MC1, quantity: new Prisma.Decimal(2), reservedQuantity: new Prisma.Decimal(0), isActive: true });
    tx.stockMovement.create.mockResolvedValue({ id: 'movement-1' });
  });
  it('uses a conditional campus-balance decrement and records its resulting quantity', async () => {
    await service.apply(tx, { inventoryItemId: 'item-1', campus: Campus.MC1, quantityChange: new Prisma.Decimal(-8), movementType: StockMovementType.WITHDRAWN, performedById: 'user-1' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inventoryStockId: 'stock-1', campus: Campus.MC1, quantityAfter: new Prisma.Decimal(2) }) }));
  });
  it('does not create a movement when available stock is insufficient', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'item-1', isActive: true });
    tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-1', isActive: true });
    await expect(service.apply(tx, { inventoryItemId: 'item-1', campus: Campus.MC1, quantityChange: new Prisma.Decimal(-11), movementType: StockMovementType.WITHDRAWN, performedById: 'user-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
  it('uses conditional updates for reserve and release', async () => {
    await service.reserve(tx, 'item-1', Campus.MC1, new Prisma.Decimal(3));
    await service.releaseReservation(tx, 'item-1', Campus.MC1, new Prisma.Decimal(3));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
