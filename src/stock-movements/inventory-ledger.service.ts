import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Campus, Prisma, StockMovementType } from '@prisma/client';

type LedgerEntry = {
  inventoryItemId: string;
  campus: Campus;
  quantityChange: Prisma.Decimal;
  movementType: StockMovementType;
  performedById: string;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
};

@Injectable()
export class InventoryLedgerService {
  async apply(tx: Prisma.TransactionClient, entry: LedgerEntry) {
    if (entry.quantityChange.isZero()) throw new BadRequestException('Quantity change cannot be zero.');
    const amount = entry.quantityChange.abs();
    const decrement = entry.quantityChange.isNegative();
    const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "InventoryStock" stock
      SET "quantity" = stock."quantity" ${decrement ? Prisma.sql`- ${amount}` : Prisma.sql`+ ${amount}`}
      WHERE stock."inventoryItemId" = ${entry.inventoryItemId}
        AND stock."campus" = ${entry.campus}::"Campus"
        AND stock."isActive" = true
        AND EXISTS (SELECT 1 FROM "InventoryItem" item WHERE item."id" = stock."inventoryItemId" AND item."isActive" = true)
        ${decrement ? Prisma.sql`AND stock."quantity" - stock."reservedQuantity" >= ${amount}` : Prisma.empty}
      RETURNING stock."id"
    `);
    if (changed.length !== 1) await this.throwUnavailable(tx, entry.inventoryItemId, entry.campus);

    const inventoryStock = await tx.inventoryStock.findUniqueOrThrow({
      where: { inventoryItemId_campus: { inventoryItemId: entry.inventoryItemId, campus: entry.campus } },
    });
    const stockMovement = await tx.stockMovement.create({
      data: {
        movementType: entry.movementType,
        quantityChange: entry.quantityChange,
        quantityAfter: inventoryStock.quantity,
        reason: entry.reason,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        inventoryItemId: entry.inventoryItemId,
        inventoryStockId: inventoryStock.id,
        campus: entry.campus,
        performedById: entry.performedById,
      },
    });
    return { inventoryStock, stockMovement };
  }

  async reserve(tx: Prisma.TransactionClient, inventoryItemId: string, campus: Campus, quantity: Prisma.Decimal) {
    if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Reservation quantity must be positive.');
    const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "InventoryStock" stock SET "reservedQuantity" = stock."reservedQuantity" + ${quantity}
      WHERE stock."inventoryItemId" = ${inventoryItemId} AND stock."campus" = ${campus}::"Campus"
        AND stock."isActive" = true AND stock."quantity" - stock."reservedQuantity" >= ${quantity}
        AND EXISTS (SELECT 1 FROM "InventoryItem" item WHERE item."id" = stock."inventoryItemId" AND item."isActive" = true)
      RETURNING stock."id"
    `);
    if (changed.length !== 1) await this.throwUnavailable(tx, inventoryItemId, campus);
  }

  async releaseReservation(tx: Prisma.TransactionClient, inventoryItemId: string, campus: Campus, quantity: Prisma.Decimal) {
    if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Reservation quantity must be positive.');
    const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "InventoryStock" stock SET "reservedQuantity" = stock."reservedQuantity" - ${quantity}
      WHERE stock."inventoryItemId" = ${inventoryItemId} AND stock."campus" = ${campus}::"Campus" AND stock."reservedQuantity" >= ${quantity}
      RETURNING stock."id"
    `);
    if (changed.length !== 1) throw new BadRequestException('Insufficient reserved quantity.');
  }

  async consumeReservation(tx: Prisma.TransactionClient, inventoryItemId: string, campus: Campus, quantity: Prisma.Decimal) {
    if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Reservation quantity must be positive.');
    const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "InventoryStock" stock SET "quantity" = stock."quantity" - ${quantity}, "reservedQuantity" = stock."reservedQuantity" - ${quantity}
      WHERE stock."inventoryItemId" = ${inventoryItemId} AND stock."campus" = ${campus}::"Campus"
        AND stock."reservedQuantity" >= ${quantity} AND stock."quantity" >= ${quantity}
      RETURNING stock."id"
    `);
    if (changed.length !== 1) throw new BadRequestException('Insufficient reserved quantity.');
  }

  async deactivateBalance(tx: Prisma.TransactionClient, inventoryItemId: string, campus: Campus) {
    const changed = await tx.inventoryStock.updateMany({
      where: { inventoryItemId, campus, quantity: 0, reservedQuantity: 0, isActive: true },
      data: { isActive: false },
    });
    if (changed.count !== 1) throw new BadRequestException('Only empty, unreserved balances may be deactivated.');
  }

  private async throwUnavailable(tx: Prisma.TransactionClient, inventoryItemId: string, campus: Campus): Promise<never> {
    const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (!item.isActive) throw new BadRequestException('Item is archived.');
    const stock = await tx.inventoryStock.findUnique({ where: { inventoryItemId_campus: { inventoryItemId, campus } } });
    if (!stock || !stock.isActive) throw new BadRequestException('No active stock balance at this campus.');
    throw new BadRequestException('Insufficient available stock.');
  }
}
