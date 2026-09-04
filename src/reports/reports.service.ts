import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async inventorySummary() {
    const [totalItems, totalQuantityAgg, itemsByType] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { isActive: true } }),
      this.prisma.inventoryItem.aggregate({
        _sum: { quantity: true },
        where: { isActive: true },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['type'],
        _count: true,
        where: { isActive: true },
      }),
    ]);

    return {
      totalItems,
      totalQuantity: totalQuantityAgg._sum.quantity?.toNumber() ?? 0,
      itemsByType: itemsByType.map((g) => ({
        type: g.type,
        count: g._count,
      })),
    };
  }

  async workRequestsByStatus() {
    const grouped = await this.prisma.workRequest.groupBy({
      by: ['status'],
      _count: true,
      where: { isActive: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

}