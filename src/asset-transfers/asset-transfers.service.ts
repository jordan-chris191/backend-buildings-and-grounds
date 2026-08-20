import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  TransferStatus,
  ItemStatus,
  ItemType,
  TransactionType,
  Campus,
  StockMovementType,   // ✅ Added
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateAssetTransferBatchDto } from './dto/create-asset-transfer-batch.dto';
import { ApproveAssetTransferBatchDto } from './dto/approve-asset-transfer-batch.dto';
import { RejectAssetTransferBatchDto } from './dto/reject-asset-transfer-batch.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AssetTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private defaultInclude = {
    inventoryItem: true,
    transferredBy: { select: { id: true, firstName: true, lastName: true } },
    approvedBy: { select: { id: true, firstName: true, lastName: true } },
    receivedBy: { select: { id: true, firstName: true, lastName: true } },
    newHolder: { select: { id: true, firstName: true, lastName: true } },
  };

  // -------------------------------------------------------------------
  // CREATE BATCH
  // -------------------------------------------------------------------
  async createBatch(userId: string, dto: CreateAssetTransferBatchDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required.');
    }

    const batchId = randomUUID();

    const createdTransfers = await this.prisma.$transaction(async (tx) => {
      const transfers: any[] = [];

      for (const itemDto of dto.items) {
        const quantity = new Prisma.Decimal(itemDto.quantity);

        if (quantity.lessThanOrEqualTo(0)) {
          throw new BadRequestException('Quantity must be greater than zero.');
        }

        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: itemDto.inventoryItemId },
        });

        if (!inventoryItem) {
          throw new NotFoundException(
            `Inventory item ${itemDto.inventoryItemId} not found.`,
          );
        }

        if (inventoryItem.status === ItemStatus.BORROWED) {
          throw new BadRequestException(
            `Item ${inventoryItem.id} is currently borrowed and cannot be transferred.`,
          );
        }

        // Check available quantity
        if (inventoryItem.quantity.lessThan(quantity)) {
          throw new BadRequestException(
            `Insufficient quantity for item ${inventoryItem.id}. Available: ${inventoryItem.quantity}, requested: ${quantity}`,
          );
        }

        const transfer = await tx.assetTransfer.create({
          data: {
            batchId,
            fromCampus: inventoryItem.campus,
            toCampus: dto.toCampus,
            reason: dto.reason,
            newHolderId: dto.newHolderId ?? null,
            quantity,
            status: TransferStatus.PENDING,
            transferredById: userId,
            inventoryItemId: itemDto.inventoryItemId,
          },
          include: this.defaultInclude,
        });

        transfers.push(transfer);
      }

      return transfers;
    });

    await this.auditLogService.log({
      action: 'CREATE',
      entityType: 'AssetTransferBatch',
      entityId: batchId,
      description: `Batch transfer created with ${createdTransfers.length} items`,
      performedById: userId,
    });

    return { batchId, items: createdTransfers };
  }

  // -------------------------------------------------------------------
  // GET BATCHES (GROUPED)
  // -------------------------------------------------------------------
  async findBatches(status?: TransferStatus) {
    const rows = await this.prisma.assetTransfer.findMany({
      where: status ? { status } : {},
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });

    const groupedMap = new Map<string, any>();

    for (const row of rows) {
      const existing = groupedMap.get(row.batchId);

      if (!existing) {
        groupedMap.set(row.batchId, {
          batchId: row.batchId,
          fromCampus: [row.fromCampus],
          toCampus: row.toCampus,
          reason: row.reason,
          newHolder: row.newHolder,
          transferredBy: row.transferredBy,
          approvedBy: row.approvedBy,
          receivedBy: row.receivedBy,
          status: row.status,
          createdAt: row.createdAt,
          approvedAt: row.approvedAt,
          rejectedAt: row.rejectedAt,
          completedAt: row.completedAt,
          decisionNotes: row.decisionNotes,
          items: [row],
        });
      } else {
        existing.items.push(row);
        if (!existing.fromCampus.includes(row.fromCampus)) {
          existing.fromCampus.push(row.fromCampus);
        }
      }
    }

    return Array.from(groupedMap.values());
  }

  // -------------------------------------------------------------------
  // APPROVE BATCH
  // -------------------------------------------------------------------
  async approveBatch(
    batchId: string,
    userId: string,
    dto: ApproveAssetTransferBatchDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.assetTransfer.findMany({
        where: { batchId },
        include: { inventoryItem: true },
      });

      if (rows.length === 0) {
        throw new NotFoundException('Transfer batch not found.');
      }

      if (rows.some((r) => r.status !== TransferStatus.PENDING)) {
        throw new ConflictException('Only PENDING batches can be approved.');
      }

      for (const row of rows) {
        const item = row.inventoryItem;
        if (!item) {
          throw new NotFoundException(
            `Inventory item ${row.inventoryItemId} not found.`,
          );
        }
        if (item.status === ItemStatus.RESERVED) {
          throw new ConflictException(`Item ${item.id} is already reserved.`);
        }
        if (
          item.status === ItemStatus.BORROWED ||
          item.status === ItemStatus.DISPOSED
        ) {
          throw new ConflictException(
            `Item ${item.id} is not available for transfer.`,
          );
        }
      }

      await tx.assetTransfer.updateMany({
        where: { batchId, status: TransferStatus.PENDING },
        data: {
          status: TransferStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          decisionNotes: dto.notes ?? undefined,
        },
      });

      for (const row of rows) {
        await tx.inventoryItem.update({
          where: { id: row.inventoryItemId },
          data: { status: ItemStatus.RESERVED },
        });
      }
    });

    await this.auditLogService.log({
      action: 'APPROVE',
      entityType: 'AssetTransferBatch',
      entityId: batchId,
      description: `Batch transfer approved by user ${userId}`,
      performedById: userId,
    });

    return { batchId, status: TransferStatus.APPROVED };
  }

  // -------------------------------------------------------------------
  // REJECT BATCH
  // -------------------------------------------------------------------
  async rejectBatch(
    batchId: string,
    userId: string,
    dto: RejectAssetTransferBatchDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.assetTransfer.findMany({
        where: { batchId },
        include: { inventoryItem: true },
      });

      if (rows.length === 0) {
        throw new NotFoundException('Transfer batch not found.');
      }

      const validStatuses: TransferStatus[] = [
        TransferStatus.PENDING,
        TransferStatus.APPROVED,
      ];
      if (rows.some((r) => !validStatuses.includes(r.status))) {
        throw new ConflictException(
          'Batch cannot be rejected from its current state.',
        );
      }

      const wasApproved = rows.some(
        (r) => r.status === TransferStatus.APPROVED,
      );

      await tx.assetTransfer.updateMany({
        where: { batchId, status: { in: validStatuses } },
        data: {
          status: TransferStatus.REJECTED,
          rejectedAt: new Date(),
          decisionNotes: dto.notes ?? undefined,
        },
      });

      if (wasApproved) {
        for (const row of rows) {
          const item = await tx.inventoryItem.findUnique({
            where: { id: row.inventoryItemId },
          });
          if (item?.status === ItemStatus.RESERVED) {
            await tx.inventoryItem.update({
              where: { id: row.inventoryItemId },
              data: { status: ItemStatus.GOOD_CONDITION },
            });
          }
        }
      }
    });

    await this.auditLogService.log({
      action: 'REJECT',
      entityType: 'AssetTransferBatch',
      entityId: batchId,
      description: `Batch transfer rejected by user ${userId}`,
      performedById: userId,
    });

    return { batchId, status: TransferStatus.REJECTED };
  }

  // -------------------------------------------------------------------
  // RECEIVE BATCH (UPDATED WITH STOCK MOVEMENT)
  // -------------------------------------------------------------------
  async receiveBatch(batchId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.assetTransfer.findMany({
        where: { batchId },
        include: { inventoryItem: true },
      });

      if (rows.length === 0) {
        throw new NotFoundException('Transfer batch not found.');
      }

      if (rows.some((r) => r.status !== TransferStatus.APPROVED)) {
        throw new ConflictException('Only APPROVED batches can be received.');
      }

      for (const row of rows) {
        // Move item to destination campus and set good condition
        await tx.inventoryItem.update({
          where: { id: row.inventoryItemId },
          data: {
            campus: row.toCampus,
            status: ItemStatus.GOOD_CONDITION,
          },
        });

        // If a new holder is assigned, create an issuance transaction
        if (row.newHolderId) {
          const controlNumber = await this.generateTransactionControlNumber(
            tx,
          );

          await tx.itemTransaction.create({
            data: {
              controlNumber,
              transactionType: TransactionType.ISSUANCE,
              inventoryItemId: row.inventoryItemId,
              quantity: row.quantity,
              personId: row.newHolderId,
              custodianId: userId, // receivedById
              transactionDate: new Date(),
              notes: `Asset transfer ${row.batchId} received`,
            },
          });
        }

        // ✅ Record the transfer as a stock movement (zero quantity change)
        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.ADJUSTED,
            quantityChange: new Prisma.Decimal(0),
            quantityAfter: row.inventoryItem.quantity,
            reason: `Item transferred from ${row.fromCampus} to ${row.toCampus}`,
            referenceType: 'AssetTransfer',
            referenceId: batchId,
            inventoryItemId: row.inventoryItemId,
            performedById: userId,
          },
        });
      }

      await tx.assetTransfer.updateMany({
        where: { batchId, status: TransferStatus.APPROVED },
        data: {
          status: TransferStatus.COMPLETED,
          receivedById: userId,
          completedAt: new Date(),
        },
      });
    });

    await this.auditLogService.log({
      action: 'RECEIVE',
      entityType: 'AssetTransferBatch',
      entityId: batchId,
      description: `Batch transfer received by user ${userId}`,
      performedById: userId,
    });

    return { batchId, status: TransferStatus.COMPLETED };
  }

  // -------------------------------------------------------------------
  // Helper: Generate sequential control number for transactions
  // -------------------------------------------------------------------
  private async generateTransactionControlNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const type = 'ISS';

    const counter = await tx.sequenceCounter.upsert({
      where: { type_year: { type, year } },
      update: { count: { increment: 1 } },
      create: { type, year, count: 1 },
    });

    const sequence = counter.count.toString().padStart(5, '0');
    return `${type}-${year}-${sequence}`;
  }
}