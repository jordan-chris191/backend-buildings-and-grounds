import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  Prisma,
  ItemStatus,
  ItemType,
  StockMovementType,
} from '@prisma/client';
import { InventoryService } from './inventory.service';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

describe('InventoryService inventory integrity', () => {
  const item = {
    id: 'item-1',
    name: 'Widget',
    type: ItemType.CONSUMABLE,
    quantity: new Prisma.Decimal(7),
    minStockLevel: null,
    unitCost: null,
    isActive: true,
    status: ItemStatus.GOOD_CONDITION,
    category: null,
    project: null,
  };
  const tx: any = {
    inventoryItem: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const prisma: any = {
    inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const audit: any = { log: jest.fn() };
  const gateway: any = { notifyInventoryUpdate: jest.fn() };
  const ledger: any = { apply: jest.fn() };
  const service = new InventoryService(prisma, audit, gateway, ledger);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inventoryItem.findUnique.mockResolvedValue(item);
    prisma.inventoryItem.update.mockResolvedValue({ ...item, name: 'Renamed' });
    tx.inventoryItem.update.mockResolvedValue({
      ...item,
      isActive: false,
      quantity: new Prisma.Decimal(0),
    });
    ledger.apply.mockResolvedValue({
      inventoryItem: { ...item, quantity: new Prisma.Decimal(0) },
    });
  });

  it('rejects quantity supplied to a normal metadata update', async () => {
    await expect(
      service.update('item-1', 'user-1', {
        name: 'Renamed',
        quantity: 999,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(ledger.apply).not.toHaveBeenCalled();
  });

  it('does not expose quantity in the update DTO', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { quantity: 999 },
        { metatype: UpdateInventoryItemDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives positive stock through the ledger then persists zero quantity', async () => {
    await service.remove('item-1', 'user-1');

    expect(ledger.apply).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quantityChange: new Prisma.Decimal(-7),
        movementType: StockMovementType.WITHDRAWN,
      }),
    );
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('does not archive or audit when the ledger operation fails', async () => {
    ledger.apply.mockRejectedValueOnce(new Error('movement failed'));

    await expect(service.remove('item-1', 'user-1')).rejects.toThrow(
      'movement failed',
    );
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('disposes positive stock through the ledger and stores zero quantity', async () => {
    await service.updateStatus('item-1', ItemStatus.DISPOSED, 'user-1');

    expect(ledger.apply).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quantityChange: new Prisma.Decimal(-7),
        movementType: StockMovementType.WITHDRAWN,
      }),
    );
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });
});
