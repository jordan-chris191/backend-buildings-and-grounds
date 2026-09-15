import { BadRequestException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { InventoryLedgerService } from './inventory-ledger.service';

describe('InventoryLedgerService', () => {
  const quantity = new Prisma.Decimal(10);
  const tx: any = {
    inventoryItem: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    stockMovement: { create: jest.fn() },
  };
  const service = new InventoryLedgerService();

  beforeEach(() => {
    jest.resetAllMocks();
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findUniqueOrThrow.mockResolvedValue({
      id: 'item-1',
      name: 'Widget',
      quantity: new Prisma.Decimal(2),
      isActive: true,
    });
    tx.stockMovement.create.mockResolvedValue({ id: 'movement-1' });
  });

  it('uses an atomic conditional decrement and records the resulting quantity', async () => {
    await service.apply(tx, {
      inventoryItemId: 'item-1',
      quantityChange: new Prisma.Decimal(-8),
      movementType: StockMovementType.WITHDRAWN,
      performedById: 'user-1',
    });

    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'item-1',
        isActive: true,
        quantity: { gte: new Prisma.Decimal(8) },
      },
      data: { quantity: { decrement: new Prisma.Decimal(8) } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantityAfter: new Prisma.Decimal(2) }),
      }),
    );
  });

  it('does not create a movement when conditional stock withdrawal fails', async () => {
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    tx.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      isActive: true,
      quantity,
    });

    await expect(
      service.apply(tx, {
        inventoryItemId: 'item-1',
        quantityChange: new Prisma.Decimal(-11),
        movementType: StockMovementType.WITHDRAWN,
        performedById: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
