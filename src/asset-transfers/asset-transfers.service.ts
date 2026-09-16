import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType, TransactionType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InventoryLedgerService } from '../stock-movements/inventory-ledger.service';
import { CreateAssetTransferBatchDto } from './dto/create-asset-transfer-batch.dto';
import { ApproveAssetTransferBatchDto } from './dto/approve-asset-transfer-batch.dto';
import { RejectAssetTransferBatchDto } from './dto/reject-asset-transfer-batch.dto';

@Injectable()
export class AssetTransfersService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService, private readonly ledger: InventoryLedgerService) {}

  private readonly include = {
    lines: { include: { inventoryItem: true, sourceInventoryStock: true } },
    transferredBy: { select: { id: true, firstName: true, lastName: true } },
    approvedBy: { select: { id: true, firstName: true, lastName: true } },
    receivedBy: { select: { id: true, firstName: true, lastName: true } },
    newHolder: { select: { id: true, firstName: true, lastName: true } },
  } as const;

  private campuses(dto: CreateAssetTransferBatchDto) {
    const sourceCampus = dto.sourceCampus ?? dto.fromCampus;
    const destinationCampus = dto.destinationCampus ?? dto.toCampus;
    if (!sourceCampus || !destinationCampus) throw new BadRequestException('sourceCampus and destinationCampus are required.');
    if (sourceCampus === destinationCampus) throw new BadRequestException('Source and destination campuses must differ.');
    return { sourceCampus, destinationCampus };
  }

  /** Keep the old response aliases while clients migrate to batch/line names. */
  private response(batch: any) {
    return {
      ...batch,
      batchId: batch.id,
      fromCampus: batch.sourceCampus,
      toCampus: batch.destinationCampus,
      items: batch.lines,
    };
  }

  async createBatch(userId: string, dto: CreateAssetTransferBatchDto) {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required.');
    const { sourceCampus, destinationCampus } = this.campuses(dto);
    const ids = dto.items.map(item => item.inventoryItemId);
    if (new Set(ids).size !== ids.length) throw new ConflictException('A transfer batch cannot contain duplicate inventory items.');
    const batch = await this.prisma.$transaction(async tx => {
      const lines: { inventoryItemId: string; sourceInventoryStockId: string; quantity: Prisma.Decimal }[] = [];
      for (const item of dto.items) {
        const quantity = new Prisma.Decimal(item.quantity);
        if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Quantity must be greater than zero.');
        const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
        if (!inventoryItem) throw new NotFoundException(`Inventory item ${item.inventoryItemId} not found.`);
        if (!inventoryItem.isActive) throw new BadRequestException(`Inventory item ${item.inventoryItemId} is archived.`);
        const stock = await tx.inventoryStock.findUnique({ where: { inventoryItemId_campus: { inventoryItemId: item.inventoryItemId, campus: sourceCampus } } });
        if (!stock || !stock.isActive) throw new BadRequestException(`No active source stock exists for item ${item.inventoryItemId} at ${sourceCampus}.`);
        lines.push({ inventoryItemId: item.inventoryItemId, sourceInventoryStockId: stock.id, quantity });
      }
      return tx.assetTransferBatch.create({ data: { sourceCampus, destinationCampus, reason: dto.reason, newHolderId: dto.newHolderId ?? null, transferredById: userId, lines: { create: lines } }, include: this.include });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.auditLogService.log({ action: 'CREATE', entityType: 'AssetTransferBatch', entityId: batch.id, description: `Transfer batch created with ${batch.lines.length} lines`, performedById: userId });
    return this.response(batch);
  }

  async findBatches(status?: TransferStatus) {
    const batches = await this.prisma.assetTransferBatch.findMany({ where: status ? { status } : {}, include: this.include, orderBy: { createdAt: 'desc' } });
    return batches.map(batch => this.response(batch));
  }

  async approveBatch(batchId: string, userId: string, dto: ApproveAssetTransferBatchDto) {
    await this.prisma.$transaction(async tx => {
      const batch = await tx.assetTransferBatch.findUnique({ where: { id: batchId }, include: { lines: true } });
      if (!batch) throw new NotFoundException('Transfer batch not found.');
      if (batch.status !== TransferStatus.PENDING) throw new ConflictException('Only PENDING batches can be approved.');
      for (const line of batch.lines) await this.ledger.reserve(tx, line.inventoryItemId, batch.sourceCampus, line.quantity);
      const changed = await tx.assetTransferBatch.updateMany({ where: { id: batchId, status: TransferStatus.PENDING }, data: { status: TransferStatus.APPROVED, approvedById: userId, approvedAt: new Date(), decisionNotes: dto.notes ?? null } });
      if (changed.count !== 1) throw new ConflictException('Transfer batch state changed concurrently.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.auditLogService.log({ action: 'APPROVE', entityType: 'AssetTransferBatch', entityId: batchId, description: `Transfer batch approved by user ${userId}`, performedById: userId });
    return { batchId, status: TransferStatus.APPROVED };
  }

  async rejectBatch(batchId: string, userId: string, dto: RejectAssetTransferBatchDto) {
    await this.prisma.$transaction(async tx => {
      const batch = await tx.assetTransferBatch.findUnique({ where: { id: batchId }, include: { lines: true } });
      if (!batch) throw new NotFoundException('Transfer batch not found.');
      if (batch.status !== TransferStatus.PENDING && batch.status !== TransferStatus.APPROVED) throw new ConflictException('Batch cannot be rejected from its current state.');
      if (batch.status === TransferStatus.APPROVED) for (const line of batch.lines) await this.ledger.releaseReservation(tx, line.inventoryItemId, batch.sourceCampus, line.quantity);
      const changed = await tx.assetTransferBatch.updateMany({ where: { id: batchId, status: batch.status }, data: { status: TransferStatus.REJECTED, rejectedAt: new Date(), decisionNotes: dto.notes ?? null } });
      if (changed.count !== 1) throw new ConflictException('Transfer batch state changed concurrently.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.auditLogService.log({ action: 'REJECT', entityType: 'AssetTransferBatch', entityId: batchId, description: `Transfer batch rejected by user ${userId}`, performedById: userId });
    return { batchId, status: TransferStatus.REJECTED };
  }

  async receiveBatch(batchId: string, userId: string) {
    await this.prisma.$transaction(async tx => {
      const batch = await tx.assetTransferBatch.findUnique({ where: { id: batchId }, include: { lines: true } });
      if (!batch) throw new NotFoundException('Transfer batch not found.');
      if (batch.status !== TransferStatus.APPROVED) throw new ConflictException('Only APPROVED batches can be received.');
      for (const line of batch.lines) {
        const transfer = await this.ledger.transferReserved(tx, { inventoryItemId: line.inventoryItemId, sourceCampus: batch.sourceCampus, destinationCampus: batch.destinationCampus, quantity: line.quantity, performedById: userId, referenceId: batchId });
        // Preserve the established optional-holder behavior, but issue from the
        // destination balance and use the shared ISS counter namespace.
        if (batch.newHolderId) {
          const transaction = await tx.itemTransaction.create({ data: {
            controlNumber: await this.generateIssuanceControlNumber(tx), transactionType: TransactionType.ISSUANCE,
            inventoryItemId: line.inventoryItemId, inventoryStockId: transfer.destination.id, campus: batch.destinationCampus,
            quantity: line.quantity, personId: batch.newHolderId, custodianId: userId, notes: `Asset transfer ${batchId} received`,
          } });
          await this.ledger.apply(tx, { inventoryItemId: line.inventoryItemId, campus: batch.destinationCampus, quantityChange: line.quantity.negated(), movementType: StockMovementType.WITHDRAWN, performedById: userId, reason: `Issued to transfer holder from ${batchId}`, referenceType: 'ItemTransaction', referenceId: transaction.id });
        }
      }
      const changed = await tx.assetTransferBatch.updateMany({ where: { id: batchId, status: TransferStatus.APPROVED }, data: { status: TransferStatus.COMPLETED, receivedById: userId, completedAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Transfer batch state changed concurrently.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.auditLogService.log({ action: 'RECEIVE', entityType: 'AssetTransferBatch', entityId: batchId, description: `Transfer batch received by user ${userId}`, performedById: userId });
    return { batchId, status: TransferStatus.COMPLETED };
  }

  private async generateIssuanceControlNumber(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear();
    const counter = await tx.sequenceCounter.upsert({
      where: { type_year: { type: 'ITEM_TRANSACTION_ISS', year } },
      update: { count: { increment: 1 } }, create: { type: 'ITEM_TRANSACTION_ISS', year, count: 1 },
    });
    return `ISS-${year}-${String(counter.count).padStart(4, '0')}`;
  }
}
