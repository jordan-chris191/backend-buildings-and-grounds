import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private readonly defaultInclude = {
    inventoryItem: {
      include: {
        category: true,
        project: true,
      },
    },
    performedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    purchaseRequest: {
      select: {
        id: true,
        controlNo: true,   // ✅ corrected from prNumber
      },
    },
  };

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  /**
   * Create a stock movement and update inventory quantity atomically.
   */
  async create(userId: string, dto: CreateStockMovementDto) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (!item.isActive) throw new BadRequestException('Item is archived.');

    if (dto.quantityChange === 0) {
      throw new BadRequestException('Quantity change cannot be zero.');
    }

    const isNegativeChange = dto.quantityChange < 0;
    const validTypeForNegative =
      dto.movementType === StockMovementType.WITHDRAWN ||
      dto.movementType === StockMovementType.ADJUSTED;
    const validTypeForPositive =
      dto.movementType === StockMovementType.RECEIVED ||
      dto.movementType === StockMovementType.RETURNED ||
      dto.movementType === StockMovementType.ADJUSTED;

    if (isNegativeChange && !validTypeForNegative) {
      throw new BadRequestException(
        `Negative quantity change only allowed for WITHDRAWN or ADJUSTED.`,
      );
    }
    if (!isNegativeChange && !validTypeForPositive) {
      throw new BadRequestException(
        `Positive quantity change only allowed for RECEIVED, RETURNED or ADJUSTED.`,
      );
    }

    const currentQuantity = item.quantity.toNumber();
    const newQuantity = currentQuantity + dto.quantityChange;
    if (newQuantity < 0) {
      throw new BadRequestException(
        `Insufficient stock. Current quantity: ${currentQuantity}, requested change: ${dto.quantityChange}`,
      );
    }

    if (dto.purchaseRequestId) {
      const purchaseRequest = await this.prisma.purchaseRequest.findUnique({
        where: { id: dto.purchaseRequestId },
      });
      if (!purchaseRequest) {
        throw new BadRequestException('Purchase request not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: {
          quantity: this.toDecimal(newQuantity),
        },
      });

      const stockMovement = await tx.stockMovement.create({
        data: {
          movementType: dto.movementType,
          quantityChange: this.toDecimal(dto.quantityChange),
          quantityAfter: this.toDecimal(newQuantity),
          reason: dto.reason,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          inventoryItemId: dto.inventoryItemId,
          performedById: userId,
          purchaseRequestId: dto.purchaseRequestId,
        },
        include: this.defaultInclude,
      });

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'StockMovement',
        entityId: stockMovement.id,
        description: `${dto.movementType} of ${dto.quantityChange} ${item.unit} of ${item.name}`,
        performedById: userId,
      });

      return stockMovement;
    });
  }

  /**
   * Helper to record a zero-quantity movement (e.g. asset transfer).
   */
  async recordTransferMovement(
    userId: string,
    batchId: string,
    itemId: string,
    quantityAfter: Prisma.Decimal,
    reason: string,
  ) {
    await this.prisma.stockMovement.create({
      data: {
        movementType: StockMovementType.ADJUSTED, // or your preferred enum
        quantityChange: new Prisma.Decimal(0),
        quantityAfter,
        reason,
        referenceType: 'AssetTransfer',
        referenceId: batchId,
        inventoryItemId: itemId,
        performedById: userId,
      },
    });
  }

  async findAll(query: QueryStockMovementDto) {
    const where: Prisma.StockMovementWhereInput = {};

    if (query.inventoryItemId) {
      where.inventoryItemId = query.inventoryItemId;
    }
    if (query.movementType) {
      where.movementType = query.movementType;
    }
    if (query.performedById) {
      where.performedById = query.performedById;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = query.from;
      }
      if (query.to) {
        where.createdAt.lte = query.to;
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: this.defaultInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!movement) throw new NotFoundException('Stock movement not found.');
    return movement;
  }
}