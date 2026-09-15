import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  TransactionType,
  StockMovementType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { InventoryLedgerService } from '../stock-movements/inventory-ledger.service';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  private readonly defaultInclude = {
    inventoryItem: {
      include: {
        category: true,
        project: true,
      },
    },
    person: true,
    custodian: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
  };

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  async create(userId: string, dto: CreateTransactionDto) {
    // 1. Fetch item once to validate existence and get metadata (name, unit)
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (!item.isActive) throw new BadRequestException('Item is archived.');

    const isWithdrawal =
      dto.transactionType === TransactionType.ISSUANCE ||
      dto.transactionType === TransactionType.WITHDRAWAL;

    // 2. Validate personId if provided
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({
        where: { id: dto.personId },
      });
      if (!person) {
        throw new BadRequestException('Person not found.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Create the transaction record first; a failed ledger update rolls it
      // back with every other operation in this transaction.
      const transaction = await tx.itemTransaction.create({
        data: {
          controlNumber: await this.generateControlNo(tx, dto.transactionType),
          transactionType: dto.transactionType,
          inventoryItemId: dto.inventoryItemId,
          quantity: this.toDecimal(dto.quantity),
          personId: dto.personId,          // now safe
          custodianId: userId,
          transactionDate: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
        },
        include: this.defaultInclude,
      });

      await this.inventoryLedgerService.apply(tx, {
        inventoryItemId: dto.inventoryItemId,
        quantityChange: this.toDecimal(isWithdrawal ? -dto.quantity : dto.quantity),
        movementType: isWithdrawal
          ? StockMovementType.WITHDRAWN
          : StockMovementType.RETURNED,
        reason: dto.notes ?? `${dto.transactionType} transaction`,
        performedById: userId,
        referenceType: 'ItemTransaction',
        referenceId: transaction.id,
      });

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'ItemTransaction',
        entityId: transaction.id,
        description: `${dto.transactionType} of ${dto.quantity} ${item.unit} of ${item.name}`,
        performedById: userId,
      }, tx);

      return transaction;
    });
  }

  private async generateControlNo(
    tx: Prisma.TransactionClient,
    type: TransactionType,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix =
      type === TransactionType.ISSUANCE
        ? 'ISS'
        : type === TransactionType.WITHDRAWAL
          ? 'WTH'
          : 'RTN';

    const sequence = await tx.sequenceCounter.upsert({
      where: { type_year: { type: `ITEM_TRANSACTION_${prefix}`, year } },
      update: { count: { increment: 1 } },
      create: { type: `ITEM_TRANSACTION_${prefix}`, year, count: 1 },
    });
    const seq = String(sequence.count).padStart(4, '0');
    return `${prefix}-${year}-${seq}`;
  }

  async findAll(type?: TransactionType) {
    return this.prisma.itemTransaction.findMany({
      where: {
        ...(type && { transactionType: type }),
      },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tx = await this.prisma.itemTransaction.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!tx) throw new NotFoundException('Transaction not found.');
    return tx;
  }

  async markAsReturned(id: string, userId: string) {
    const tx = await this.findOne(id);
    if (
      tx.transactionType !== TransactionType.ISSUANCE &&
      tx.transactionType !== TransactionType.WITHDRAWAL
    ) {
      throw new BadRequestException(
        'Only issuances/withdrawals can be returned.',
      );
    }
    if (tx.returnedAt) {
      throw new BadRequestException('Transaction already returned.');
    }

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: tx.inventoryItemId },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (!item.isActive) {
      throw new BadRequestException('Cannot return to an archived item.');
    }

    return this.prisma.$transaction(async (prismaTx) => {
      const claim = await prismaTx.itemTransaction.updateMany({
        where: { id, returnedAt: null },
        data: { returnedAt: new Date() },
      });
      if (claim.count !== 1) {
        throw new BadRequestException('Transaction already returned.');
      }

      await this.inventoryLedgerService.apply(prismaTx, {
        inventoryItemId: tx.inventoryItemId,
        quantityChange: tx.quantity,
        movementType: StockMovementType.RETURNED,
        reason: `Return from ${tx.controlNumber}`,
        performedById: userId,
        referenceType: 'ItemTransaction',
        referenceId: id,
      });

      await this.auditLogService.log({
        action: 'RETURN',
        entityType: 'ItemTransaction',
        entityId: id,
        description: `Item ${tx.inventoryItem.name} returned`,
        performedById: userId,
      }, prismaTx);

      return prismaTx.itemTransaction.findUnique({
        where: { id },
        include: this.defaultInclude,
      });
    });
  }
}
