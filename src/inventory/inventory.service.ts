// src/inventory/inventory.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Campus,
  ItemStatus,
  ItemType,
  StockMovementType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InventoryGateway } from '../gateway/inventory.gateway';
import { InventoryLedgerService } from '../stock-movements/inventory-ledger.service';

import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

const DEFAULT_LOW_STOCK_THRESHOLD = 5; // adjust as needed

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryGateway: InventoryGateway,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  private readonly defaultInclude = {
    category: true,
    project: true,
  };

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  private toResponseItem(item: any) {
    const quantity = Number(item.quantity);
    const threshold =
      item.minStockLevel != null
        ? Number(item.minStockLevel)
        : DEFAULT_LOW_STOCK_THRESHOLD;

    const isLowStock = quantity <= threshold;
    const unitCost = item.unitCost != null ? Number(item.unitCost) : null;
    const totalValue = unitCost != null
      ? Math.round(quantity * unitCost * 100) / 100
      : null;

    return {
      ...item,
      totalValue,
      isLowStock,
    };
  }

  // ---------- CREATE ----------
  async create(userId: string, dto: CreateInventoryItemDto) {
    if (dto.type === ItemType.CONSUMABLE && !dto.unit) {
      throw new BadRequestException('Consumable items require a unit.');
    }

    const quantity = dto.quantity ?? 1;

    const rawItem = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          name: dto.name,
          type: dto.type,
          description: dto.description,
          // New rows start at zero; initial stock, when present, is applied by
          // the ledger below with its matching RECEIVED movement.
          quantity: this.toDecimal(0),
          unit: dto.unit,
          location: dto.location,
          propertyNumber: dto.propertyNumber,
          serialNumber: dto.serialNumber,
          campus: dto.campus,
          unitCost: dto.unitCost != null ? this.toDecimal(dto.unitCost) : undefined,
          acquisitionDate: dto.acquisitionDate
            ? new Date(dto.acquisitionDate)
            : undefined,
          projectId: dto.projectId,
          categoryId: dto.categoryId,
        },
        include: this.defaultInclude,
      });

      if (quantity > 0) {
        await this.inventoryLedgerService.apply(tx, {
          movementType: StockMovementType.RECEIVED,
          quantityChange: this.toDecimal(quantity),
          reason: 'Initial stock',
          inventoryItemId: item.id,
          performedById: userId,
        });
      }

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'InventoryItem',
        entityId: item.id,
        description: `Created inventory item "${item.name}" (${item.type})`,
        performedById: userId,
      }, tx);

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.id },
        include: this.defaultInclude,
      });
    });

    const responseItem = this.toResponseItem(rawItem);

    this.inventoryGateway.notifyInventoryUpdate(
      responseItem.id,
      responseItem.name,
      Number(responseItem.quantity),
      responseItem.status,
    );

    return responseItem;
  }

  // ---------- FIND ALL (with optional lowStock filter) ----------
  async findAll(
    type?: ItemType,
    projectId?: string,
    categoryId?: string,
    campus?: Campus,
    status?: ItemStatus,
    lowStock?: boolean,                     // ← new optional filter
  ) {
    const where: Prisma.InventoryItemWhereInput = {
      isActive: true,
      ...(type && { type }),
      ...(projectId && { projectId }),
      ...(categoryId && { categoryId }),
      ...(campus && { campus }),
      ...(status && { status }),
    };

    if (lowStock !== undefined) {
      // Global threshold used here; if you later add per-item thresholds,
      // you can filter in-memory or use a raw query.
      where.quantity = {
        lte: new Prisma.Decimal(DEFAULT_LOW_STOCK_THRESHOLD),
      };
    }

    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.toResponseItem(item));
  }

  // ---------- FIND ONE ----------
  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }
    return this.toResponseItem(item);
  }

  // ---------- STOCK HISTORY ----------
  async getStockHistory(id: string) {
    await this.findOne(id);
    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------- UPDATE ----------
  async update(id: string, performedById: string, dto: UpdateInventoryItemDto) {
    const existing = await this.findOne(id);

    if (
      existing.type === ItemType.CONSUMABLE &&
      dto.unit !== undefined &&
      dto.unit.trim() === ''
    ) {
      throw new BadRequestException('Consumable items require a unit.');
    }

    // The DTO and global ValidationPipe reject quantity at the HTTP boundary.
    // Reject it here too for direct/internal callers that bypass validation.
    const metadata = dto as UpdateInventoryItemDto & {
      quantity?: unknown;
    };
    if (metadata.quantity !== undefined) {
      throw new BadRequestException(
        'Quantity changes must use the inventory adjustment or transaction path.',
      );
    }
    const { quantity: _quantity, ...updateData } = metadata;

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...updateData,
        acquisitionDate: updateData.acquisitionDate
          ? new Date(updateData.acquisitionDate)
          : undefined,
        unitCost: updateData.unitCost !== undefined ? this.toDecimal(updateData.unitCost) : undefined,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'InventoryItem',
      entityId: id,
      description: `Updated inventory item "${updated.name}"`,
      performedById,
    });

    const responseItem = this.toResponseItem(updated);

    return responseItem;
  }

  // ---------- ADJUST QUANTITY ----------
  async adjustQuantity(id: string, userId: string, newQuantity: number, reason: string) {
    const item = await this.findOne(id);
    const oldQuantity = Number(item.quantity);
    const change = newQuantity - oldQuantity;

    if (newQuantity < 0) {
      throw new BadRequestException('Quantity cannot be negative.');
    }
    if (change === 0) {
      return item;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const { inventoryItem } = await this.inventoryLedgerService.apply(tx, {
        inventoryItemId: id,
        quantityChange: this.toDecimal(change),
        movementType: StockMovementType.ADJUSTED,
        reason,
        performedById: userId,
      });

      await this.auditLogService.log({
        action: 'ADJUST_QUANTITY',
        entityType: 'InventoryItem',
        entityId: id,
        description: `Adjusted quantity from ${oldQuantity} to ${newQuantity}. Reason: ${reason}`,
        performedById: userId,
      }, tx);

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id: inventoryItem.id },
        include: this.defaultInclude,
      });
    });

    const responseItem = this.toResponseItem(updated);

    this.inventoryGateway.notifyInventoryUpdate(
      responseItem.id,
      responseItem.name,
      Number(responseItem.quantity),
      responseItem.status,
    );

    return responseItem;
  }

  // ---------- ARCHIVE (REMOVE) ----------
  async remove(id: string, performedById: string) {
    const item = await this.findOne(id);

    if (!item.isActive) {
      throw new BadRequestException('Item is already archived.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (!item.quantity.isZero()) {
        await this.inventoryLedgerService.apply(tx, {
          inventoryItemId: id,
          quantityChange: item.quantity.negated(),
          movementType: StockMovementType.WITHDRAWN,
          reason: 'Item archived',
          performedById,
        });
      }

      await tx.inventoryItem.update({
        where: { id },
        data: { isActive: false },
      });

      await this.auditLogService.log({
        action: 'ARCHIVE',
        entityType: 'InventoryItem',
        entityId: id,
        description: `Archived inventory item "${item.name}"`,
        performedById,
      }, tx);
    });

    this.inventoryGateway.notifyInventoryUpdate(id, item.name, 0, 'ARCHIVED');
    return { message: 'Inventory item archived successfully.' };
  }

  // ---------- UPDATE STATUS ----------
  async updateStatus(id: string, status: ItemStatus, performedById: string) {
    const item = await this.findOne(id);

    const rawUpdated = await this.prisma.$transaction(async (tx) => {
      if (status === ItemStatus.DISPOSED && !item.quantity.isZero()) {
        await this.inventoryLedgerService.apply(tx, {
          inventoryItemId: id,
          quantityChange: item.quantity.negated(),
          movementType: StockMovementType.WITHDRAWN,
          reason: `Item disposed (status changed to ${status})`,
          performedById,
        });
      }

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          status,
          isActive: status === ItemStatus.DISPOSED ? false : item.isActive,
        },
        include: this.defaultInclude,
      });

      await this.auditLogService.log({
        action: 'STATUS_CHANGE',
        entityType: 'InventoryItem',
        entityId: id,
        description: `Changed status from ${item.status} to ${status}`,
        performedById,
      }, tx);

      return updated;
    });

    const responseItem = this.toResponseItem(rawUpdated);

    this.inventoryGateway.notifyInventoryUpdate(
      responseItem.id,
      responseItem.name,
      Number(responseItem.quantity),
      responseItem.status,
    );

    return responseItem;
  }

  // ---------- FIND CATEGORIES ----------
  async findCategories() {
    return this.prisma.itemCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
