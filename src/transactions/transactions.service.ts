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
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
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

    const currentQuantity = item.quantity.toNumber();
    const isWithdrawal =
      dto.transactionType === TransactionType.ISSUANCE ||
      dto.transactionType === TransactionType.WITHDRAWAL;

    // 2. Early check (non‑atomic) – helps fast fail
    if (isWithdrawal && currentQuantity < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${currentQuantity}`,
      );
    }

    // 3. ✅ Validate personId if provided
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({
        where: { id: dto.personId },
      });
      if (!person) {
        throw new BadRequestException('Person not found.');
      }
    }

    const controlNo = await this.generateControlNo(dto.transactionType);

    return this.prisma.$transaction(async (tx) => {
      // 4. Create the transaction record
      const transaction = await tx.itemTransaction.create({
        data: {
          controlNumber: controlNo,
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

      // 5. Update inventory quantity atomically
      let newQuantity: number;
      if (isWithdrawal) {
        const result = await tx.inventoryItem.updateMany({
          where: {
            id: dto.inventoryItemId,
            quantity: { gte: this.toDecimal(dto.quantity) },
          },
          data: {
            quantity: { decrement: this.toDecimal(dto.quantity) },
          },
        });
        if (result.count === 0) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${currentQuantity}`,
          );
        }
        newQuantity = currentQuantity - dto.quantity;
      } else {
        // RETURN – increment
        await tx.inventoryItem.update({
          where: { id: dto.inventoryItemId },
          data: { quantity: { increment: this.toDecimal(dto.quantity) } },
        });
        newQuantity = currentQuantity + dto.quantity;
      }

      // 6. Record stock movement
      const movementType = isWithdrawal
        ? StockMovementType.WITHDRAWN
        : StockMovementType.RETURNED;

      await tx.stockMovement.create({
        data: {
          movementType,
          quantityChange: this.toDecimal(
            isWithdrawal ? -dto.quantity : dto.quantity,
          ),
          quantityAfter: this.toDecimal(newQuantity),
          reason: dto.notes ?? `${dto.transactionType} transaction`,
          inventoryItemId: dto.inventoryItemId,
          performedById: userId,
          referenceType: 'ItemTransaction',
          referenceId: transaction.id,
        },
      });

      // 7. Audit log
      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'ItemTransaction',
        entityId: transaction.id,
        description: `${dto.transactionType} of ${dto.quantity} ${item.unit} of ${item.name}`,
        performedById: userId,
      });

      return transaction;
    });
  }

  private async generateControlNo(
    type: TransactionType,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix =
      type === TransactionType.ISSUANCE
        ? 'ISS'
        : type === TransactionType.WITHDRAWAL
          ? 'WTH'
          : 'RTN';

    const sequence = await this.prisma.sequenceCounter.upsert({
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

    const currentQuantity = item.quantity.toNumber();
    const newQuantity = currentQuantity + tx.quantity.toNumber();

    return this.prisma.$transaction(async (prismaTx) => {
      await prismaTx.itemTransaction.update({
        where: { id },
        data: { returnedAt: new Date() },
      });

      await prismaTx.inventoryItem.update({
        where: { id: tx.inventoryItemId },
        data: { quantity: { increment: tx.quantity } },
      });

      await prismaTx.stockMovement.create({
        data: {
          movementType: StockMovementType.RETURNED,
          quantityChange: tx.quantity,
          quantityAfter: this.toDecimal(newQuantity),
          reason: `Return from ${tx.controlNumber}`,
          inventoryItemId: tx.inventoryItemId,
          performedById: userId,
          referenceType: 'ItemTransaction',
          referenceId: id,
        },
      });

      await this.auditLogService.log({
        action: 'RETURN',
        entityType: 'ItemTransaction',
        entityId: id,
        description: `Item ${tx.inventoryItem.name} returned`,
        performedById: userId,
      });

      return prismaTx.itemTransaction.findUnique({
        where: { id },
        include: this.defaultInclude,
      });
    });
  }
}