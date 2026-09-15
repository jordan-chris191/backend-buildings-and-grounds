import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';

type LedgerEntry = {
  inventoryItemId: string;
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
    if (entry.quantityChange.isZero()) {
      throw new BadRequestException('Quantity change cannot be zero.');
    }

    const isWithdrawal = entry.quantityChange.isNegative();
    const absoluteQuantity = entry.quantityChange.abs();
    const result = await tx.inventoryItem.updateMany({
      where: {
        id: entry.inventoryItemId,
        isActive: true,
        ...(isWithdrawal && { quantity: { gte: absoluteQuantity } }),
      },
      data: {
        quantity: isWithdrawal
          ? { decrement: absoluteQuantity }
          : { increment: absoluteQuantity },
      },
    });

    if (result.count === 0) {
      const item = await tx.inventoryItem.findUnique({
        where: { id: entry.inventoryItemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found.');
      }
      if (!item.isActive) {
        throw new BadRequestException('Item is archived.');
      }
      throw new BadRequestException('Insufficient stock.');
    }

    const inventoryItem = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: entry.inventoryItemId },
    });
    const stockMovement = await tx.stockMovement.create({
      data: {
        movementType: entry.movementType,
        quantityChange: entry.quantityChange,
        quantityAfter: inventoryItem.quantity,
        reason: entry.reason,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        inventoryItemId: entry.inventoryItemId,
        performedById: entry.performedById,
      },
    });

    return { inventoryItem, stockMovement };
  }
}
