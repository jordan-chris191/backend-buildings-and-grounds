// src/inventory/inventory.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ItemType, Campus, ItemStatus } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  private readonly defaultInclude = {
    category: true,
    project: true,
  };

  async create(userId: string, dto: CreateInventoryItemDto) {
    const quantity = dto.quantity ?? 1;
    const totalValue = dto.unitCost != null ? dto.unitCost * quantity : undefined;

    const item = await this.prisma.inventoryItem.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        campus: dto.campus,
        quantity,
        unit: dto.unit,
        location: dto.location,
        propertyNumber: dto.propertyNumber,
        serialNumber: dto.serialNumber,
        projectId: dto.projectId,
        unitCost: dto.unitCost,
        categoryId: dto.categoryId,
        totalValue,
        acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : undefined,
      },
      include: this.defaultInclude,
    });

    await this.prisma.stockMovement.create({
      data: {
        movementType: 'RECEIVED',
        quantityChange: quantity,
        quantityAfter: quantity,
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
  }

  async findAll(
    type?: ItemType,
    projectId?: string,
    categoryId?: string,
    campus?: Campus,
    status?: ItemStatus,
  ) {
    return this.prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(campus ? { campus } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude,
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    return item;
  }

  async getStockHistory(id: string) {
    await this.findOne(id);
    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: true },
    });
  }

  async update(id: string, dto: UpdateInventoryItemDto) {
    const existing = await this.findOne(id);

    const quantity = dto.quantity ?? Number(existing.quantity);
    const unitCost = dto.unitCost ?? (existing.unitCost != null ? Number(existing.unitCost) : undefined);
    const totalValue = unitCost != null ? unitCost * quantity : undefined;

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...dto,
        totalValue,
        acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : undefined,
      },
      include: this.defaultInclude,
    });
  }

  async remove(id: string, performedById: string) {
    const item = await this.findOne(id);

    await this.prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DELETE',
      entityType: 'InventoryItem',
      entityId: id,
      description: `Deactivated inventory item "${item.name}"`,
      performedById,
    });

    return item;
  }

  async adjustQuantity(id: string, userId: string, newQuantity: number, reason: string) {
    const item = await this.findOne(id);
    const oldQuantity = Number(item.quantity);
    const change = newQuantity - oldQuantity;
    const unitCost = item.unitCost != null ? Number(item.unitCost) : undefined;
    const newTotalValue = unitCost != null ? unitCost * newQuantity : undefined;

    const [updated] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { quantity: newQuantity, totalValue: newTotalValue },
        include: this.defaultInclude,
      }),
      this.prisma.stockMovement.create({
        data: {
          movementType: 'ADJUSTED',
          quantityChange: change,
          quantityAfter: newQuantity,
          reason,
          inventoryItemId: id,
          performedById: userId,
        },
      }),
    ]);

    await this.auditLogService.log({
      action: 'ADJUST',
      entityType: 'InventoryItem',
      entityId: id,
      description: `Adjusted "${item.name}" from ${oldQuantity} to ${newQuantity} (${reason})`,
      performedById: userId,
    });

    return updated;
  }

  async findCategories() {
    return this.prisma.itemCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async updateStatus(id: string, status: ItemStatus, performedById: string) {
    const item = await this.findOne(id);

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        status,
        isActive: status === 'DISPOSED' ? false : item.isActive,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'STATUS_CHANGE',
      entityType: 'InventoryItem',
      entityId: id,
      description: `Changed "${item.name}" status from ${item.status} to ${status}`,
      performedById,
    });

    return updated;
  }
}