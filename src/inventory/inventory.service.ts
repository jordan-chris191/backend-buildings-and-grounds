// src/inventory/inventory.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { ItemType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({ data: dto });
  }

  async findAll(type?: ItemType, projectId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    return item;
  }

  async update(id: string, dto: UpdateInventoryItemDto) {
    await this.findOne(id); // throws if not found
    return this.prisma.inventoryItem.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.inventoryItem.delete({ where: { id } });
  }
}