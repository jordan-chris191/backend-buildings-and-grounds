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
import { InventoryGateway } from '../gateway/inventory.gateway'; // ← ADD THIS

import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryGateway: InventoryGateway, // ← ADD THIS
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
    const unitCost = item.unitCost != null ? Number(item.unitCost) : null;
    const totalValue = unitCost != null
      ? Math.round(quantity * unitCost * 100) / 100
      : null;

    return {
      ...item,
      totalValue,
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
          quantity: this.toDecimal(quantity),
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

      await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.RECEIVED,
          quantityChange: this.toDecimal(quantity),
          quantityAfter: this.toDecimal(quantity),
          reason: 'Initial stock',
          inventoryItemId: item.id,
          performedById: userId,
        },
      });

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'InventoryItem',
        entityId: item.id,
        description: `Created inventory item "${item.name}" (${item.type})`,
        performedById: userId,
      });

      return item;
    });

    const responseItem = this.toResponseItem(rawItem);

    // ✅ Notify about new item
    this.inventoryGateway.notifyInventoryUpdate(
      responseItem.id,
      responseItem.name,
      Number(responseItem.quantity),
      responseItem.status,
    );

    return responseItem;
  }

  // ---------- FIND ALL ----------
  async findAll(
    type?: ItemType,
    projectId?: string,
    categoryId?: string,
    campus?: Campus,
    status?: ItemStatus,
  ) {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(type && { type }),
        ...(projectId && { projectId }),
        ...(categoryId && { categoryId }),
        ...(campus && { campus }),
        ...(status && { status }),
      },
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

  const updated = await this.prisma.inventoryItem.update({
    where: { id },
    data: {
      ...dto,
      acquisitionDate: dto.acquisitionDate
        ? new Date(dto.acquisitionDate)
        : undefined,
      unitCost: dto.unitCost !== undefined ? this.toDecimal(dto.unitCost) : undefined,
      quantity: dto.quantity !== undefined ? this.toDecimal(dto.quantity) : undefined,
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

  // ✅ Only notify when quantity changes (status changes handled separately)
  if (dto.quantity !== undefined) {
    this.inventoryGateway.notifyInventoryUpdate(
      responseItem.id,
      responseItem.name,
      Number(responseItem.quantity),
      responseItem.status,
    );
  }

  return responseItem;
}

  // ---------- ADJUST QUANTITY ----------
  async adjustQuantity(id: string, userId: string, newQuantity: number, reason: string) {
    const item = await this.findOne(id);
    const oldQuantity = Number(item.quantity);
    const change = newQuantity - oldQuantity;

    const [updated] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { quantity: this.toDecimal(newQuantity) },
        include: this.defaultInclude,
      }),
      this.prisma.stockMovement.create({
        data: {
          movementType: StockMovementType.ADJUSTED,
          quantityChange: this.toDecimal(change),
          quantityAfter: this.toDecimal(newQuantity),
          reason,
          inventoryItemId: id,
          performedById: userId,
        },
      }),
    ]);

    await this.auditLogService.log({
      action: 'ADJUST_QUANTITY',
      entityType: 'InventoryItem',
      entityId: id,
      description: `Adjusted quantity from ${oldQuantity} to ${newQuantity}. Reason: ${reason}`,
      performedById: userId,
    });

    const responseItem = this.toResponseItem(updated);

    // ✅ Notify about quantity change
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

    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.WITHDRAWN,
          quantityChange: this.toDecimal(-Number(item.quantity)),
          quantityAfter: this.toDecimal(0),
          reason: 'Item archived',
          inventoryItemId: id,
          performedById,
        },
      });

      await this.auditLogService.log({
        action: 'ARCHIVE',
        entityType: 'InventoryItem',
        entityId: id,
        description: `Archived inventory item "${item.name}"`,
        performedById,
      });

      // ✅ Notify that item is archived (quantity = 0)
      this.inventoryGateway.notifyInventoryUpdate(
        id,
        item.name,
        0,
        'ARCHIVED',
      );

      return { message: 'Inventory item archived successfully.' };
    });
  }

  // ---------- UPDATE STATUS ----------
  async updateStatus(id: string, status: ItemStatus, performedById: string) {
    const item = await this.findOne(id);

    const rawUpdated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          status,
          isActive: status === ItemStatus.DISPOSED ? false : item.isActive,
        },
        include: this.defaultInclude,
      });

      if (status === ItemStatus.DISPOSED) {
        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.WITHDRAWN,
            quantityChange: this.toDecimal(-Number(item.quantity)),
            quantityAfter: this.toDecimal(0),
            reason: `Item disposed (status changed to ${status})`,
            inventoryItemId: id,
            performedById,
          },
        });
      }

      await this.auditLogService.log({
        action: 'STATUS_CHANGE',
        entityType: 'InventoryItem',
        entityId: id,
        description: `Changed status from ${item.status} to ${status}`,
        performedById,
      });

      return updated;
    });

    const responseItem = this.toResponseItem(rawUpdated);

    // ✅ Notify about status change
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