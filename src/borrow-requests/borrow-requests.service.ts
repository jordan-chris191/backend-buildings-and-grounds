// src/borrow-requests/borrow-requests.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateBorrowRequestDto } from './dto/create-borrow-request.dto';
import { ProcessBorrowRequestDto } from './dto/process-borrow-request.dto';
import { UpdateBorrowRequestDto } from './dto/update-borrow-request.dto';
import {
  BorrowRequestStatus,
  StockMovementType,
  TransactionType,
  ItemStatus,
  Prisma,
} from '@prisma/client';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryLedgerService } from '../stock-movements/inventory-ledger.service';

const BORROW_RETURN_PRIVILEGED_ROLES = [
  'Administrator',
  'Building & Grounds Officer',
  'Property Custodian',
];

@Injectable()
export class BorrowRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly gateway: BorrowRequestsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  private include = {
    inventoryItem: true,
    requestedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        office: { select: { name: true } },
      },
    },
    approvedBy: { select: { id: true, firstName: true, lastName: true } },
    transaction: true,
  };

  // ---------- CREATE ----------
  async create(userId: string, dto: CreateBorrowRequestDto) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!item) throw new NotFoundException('Item not found.');
    if (!item.isActive) throw new BadRequestException('Item is archived.');
    if (item.status === ItemStatus.BORROWED) {
      throw new BadRequestException('Item is currently borrowed.');
    }
    if (item.quantity.toNumber() < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${item.quantity}`,
      );
    }

    return this.prisma.borrowRequest.create({
      data: {
        inventoryItemId: dto.inventoryItemId,
        requestedById: userId,
        quantity: new Prisma.Decimal(dto.quantity),
        reason: dto.reason,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: BorrowRequestStatus.PENDING,
      },
      include: this.include,
    });
  }

  // ---------- FIND ALL ----------
  async findAll(status?: BorrowRequestStatus, userId?: string) {
    const where: any = { ...(status && { status }) };
    if (userId) {
      where.requestedById = userId;
    }
    return this.prisma.borrowRequest.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------- FIND ONE ----------
  async findOne(id: string) {
    const req = await this.prisma.borrowRequest.findUnique({
      where: { id },
      include: this.include,
    });
    if (!req) throw new NotFoundException('Borrow request not found.');
    return req;
  }

  // ---------- FIND MINE ----------
  async findMine(userId: string, status?: BorrowRequestStatus) {
    return this.prisma.borrowRequest.findMany({
      where: {
        requestedById: userId,
        ...(status && { status }),
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------- APPROVE ----------
  async approve(id: string, adminId: string, dto: ProcessBorrowRequestDto) {
    const type = dto.transactionType ?? TransactionType.ISSUANCE;
    const notes = dto.notes;

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({
        where: { id },
        include: this.include,
      });
      if (!request) throw new NotFoundException('Borrow request not found.');

      // Claim the pending request in the same transaction. A competing
      // approval gets no claim and therefore cannot create issue side effects.
      const claim = await tx.borrowRequest.updateMany({
        where: { id, status: BorrowRequestStatus.PENDING },
        data: {
          status: type === TransactionType.RETURN
            ? BorrowRequestStatus.RETURNED
            : BorrowRequestStatus.APPROVED,
          approvedById: adminId,
          approvedAt: new Date(),
          decisionNotes: notes,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : request.dueDate,
          ...(type === TransactionType.RETURN && { returnedAt: new Date() }),
        },
      });
      if (claim.count !== 1) {
        throw new ConflictException('Borrow request has already been processed.');
      }

      if (type === TransactionType.ISSUANCE || type === TransactionType.WITHDRAWAL) {
        await this.inventoryLedgerService.apply(tx, {
          inventoryItemId: request.inventoryItemId,
          quantityChange: request.quantity.negated(),
          movementType: StockMovementType.WITHDRAWN,
          reason: `Borrow approved (${type}): ${request.id}`,
          performedById: adminId,
          referenceType: 'BorrowRequest',
          referenceId: request.id,
        });

        if (type === TransactionType.ISSUANCE) {
          await tx.inventoryItem.update({
            where: { id: request.inventoryItemId },
            data: { status: ItemStatus.BORROWED },
          });
        }

        const transaction = await tx.itemTransaction.create({
          data: {
            controlNumber: await this.generateTransactionControlNo(tx),
            transactionType: type,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: adminId,
            transactionDate: new Date(),
            notes: `Borrow request approved (${type}): ${request.id}`,
          },
        });
        await tx.borrowRequest.update({ where: { id }, data: { transactionId: transaction.id } });
      } else if (type === TransactionType.RETURN) {
        await this.inventoryLedgerService.apply(tx, {
          inventoryItemId: request.inventoryItemId,
          quantityChange: request.quantity,
          movementType: StockMovementType.RETURNED,
          reason: `Borrow approved as RETURN: ${request.id}`,
          performedById: adminId,
          referenceType: 'BorrowRequest',
          referenceId: request.id,
        });
        await tx.itemTransaction.create({
          data: {
            controlNumber: await this.generateTransactionControlNo(tx),
            transactionType: TransactionType.RETURN,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: adminId,
            transactionDate: new Date(),
            notes: `Borrow request closed as RETURN (direct): ${request.id}`,
          },
        });
      }

      await this.auditLogService.log({
        action: 'APPROVE_BORROW',
        entityType: 'BorrowRequest',
        entityId: id,
        description: `Borrow request approved as ${type}`,
        performedById: adminId,
      }, tx);

      return tx.borrowRequest.findUnique({
        where: { id },
        include: this.include,
      });
    });

    // ✅ Notify the requester via WebSocket
    if (updatedRequest) {
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: updatedRequest.status,
        message: `✅ Your borrow request for "${updatedRequest.inventoryItem.name}" has been approved!`,
      });

      // 🆕 CREATE DATABASE NOTIFICATION
      await this.notificationsService.create({
        title: 'Borrow request approved',
        message: `Your request for "${updatedRequest.inventoryItem.name}" has been approved.`,
        userId: updatedRequest.requestedById,
      });
    }

    return updatedRequest;
  }

  // ---------- REJECT ----------
  async reject(id: string, adminId: string, dto: ProcessBorrowRequestDto) {
    const request = await this.findOne(id);
    if (request.status !== BorrowRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected.');
    }

    const updatedRequest = await this.prisma.borrowRequest.update({
      where: { id },
      data: {
        status: BorrowRequestStatus.REJECTED,
        approvedById: adminId,
        rejectedAt: new Date(),
        decisionNotes: dto.notes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : request.dueDate,
      },
      include: this.include,
    });

    await this.auditLogService.log({
      action: 'REJECT_BORROW',
      entityType: 'BorrowRequest',
      entityId: id,
      description: `Borrow request rejected`,
      performedById: adminId,
    });

    // ✅ Notify the requester via WebSocket
    this.gateway.notifyUser(updatedRequest.requestedById, {
      requestId: id,
      status: 'REJECTED',
      message: `❌ Your borrow request for "${updatedRequest.inventoryItem.name}" has been rejected.`,
    });

    // 🆕 CREATE DATABASE NOTIFICATION
    await this.notificationsService.create({
      title: 'Borrow request rejected',
      message: `Your request for "${updatedRequest.inventoryItem.name}" has been rejected.`,
      userId: updatedRequest.requestedById,
    });

    return updatedRequest;
  }

  // ---------- RETURN ----------
  async markReturned(id: string, userId: string, userRole?: string) {
    const request = await this.findOne(id);
    if (
      request.requestedById !== userId &&
      !BORROW_RETURN_PRIVILEGED_ROLES.includes(userRole ?? '')
    ) {
      throw new ForbiddenException('You may only return your own borrow request.');
    }
    if (request.status !== BorrowRequestStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be returned.');
    }
    if (request.returnedAt) {
      throw new BadRequestException('Already returned.');
    }

    const transaction = request.transaction;
    const transactionType = transaction?.transactionType ?? TransactionType.ISSUANCE;

    if (transactionType === TransactionType.ISSUANCE) {
      const updatedRequest = await this.prisma.$transaction(async (tx) => {
        // Re-check and claim inside the transaction so two return calls cannot
        // each restore stock and write a return transaction.
        const claim = await tx.borrowRequest.updateMany({
          where: {
            id,
            status: BorrowRequestStatus.APPROVED,
            returnedAt: null,
          },
          data: {
            status: BorrowRequestStatus.RETURNED,
            returnedAt: new Date(),
          },
        });
        if (claim.count !== 1) {
          throw new ConflictException('Borrow request has already been returned or processed.');
        }

        await this.inventoryLedgerService.apply(tx, {
          inventoryItemId: request.inventoryItemId,
          quantityChange: request.quantity,
          movementType: StockMovementType.RETURNED,
          reason: `Borrow returned: ${request.id}`,
          performedById: userId,
          referenceType: 'BorrowRequest',
          referenceId: request.id,
        });

        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: { status: ItemStatus.GOOD_CONDITION },
        });

        const controlNo = await this.generateTransactionControlNo(tx);
        await tx.itemTransaction.create({
          data: {
            controlNumber: controlNo,
            transactionType: TransactionType.RETURN,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: userId,
            transactionDate: new Date(),
            notes: `Return from borrow request ${request.id}`,
          },
        });

        await this.auditLogService.log({
          action: 'RETURN_BORROW',
          entityType: 'BorrowRequest',
          entityId: id,
          description: 'Borrow request returned (ISSUANCE)',
          performedById: userId,
        }, tx);

        return tx.borrowRequest.findUniqueOrThrow({
          where: { id },
          include: this.include,
        });
      });

      if (!updatedRequest) {
        throw new NotFoundException('Failed to update borrow request.');
      }

      // ✅ Notify the requester via WebSocket
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: 'RETURNED',
        message: `🔄 The item "${updatedRequest.inventoryItem.name}" has been returned.`,
      });

      // 🆕 CREATE DATABASE NOTIFICATION
      await this.notificationsService.create({
        title: 'Borrow request returned',
        message: `The item "${updatedRequest.inventoryItem.name}" has been returned.`,
        userId: updatedRequest.requestedById,
      });

      return updatedRequest;
    } 
    
    else if (transactionType === TransactionType.WITHDRAWAL) {
      const updatedRequest = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.borrowRequest.updateMany({
          where: { id, status: BorrowRequestStatus.APPROVED, returnedAt: null },
          data: { status: BorrowRequestStatus.RETURNED, returnedAt: new Date() },
        });
        if (claim.count !== 1) {
          throw new ConflictException('Borrow request has already been returned or processed.');
        }
        await this.auditLogService.log({
          action: 'RETURN_BORROW',
          entityType: 'BorrowRequest',
          entityId: id,
          description: 'Borrow request closed-out (WITHDRAWAL)',
          performedById: userId,
        }, tx);
        return tx.borrowRequest.findUniqueOrThrow({ where: { id }, include: this.include });
      });

      // ✅ Notify the requester via WebSocket
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: 'RETURNED',
        message: `📄 Your borrow request for "${updatedRequest.inventoryItem.name}" has been closed.`,
      });

      // 🆕 CREATE DATABASE NOTIFICATION
      await this.notificationsService.create({
        title: 'Borrow request closed',
        message: `Your borrow request for "${updatedRequest.inventoryItem.name}" has been closed.`,
        userId: updatedRequest.requestedById,
      });

      return updatedRequest;
    }

    throw new BadRequestException('This borrow request does not require a return.');
  }

  // ---------- UPDATE ----------
  async update(id: string, userId: string, dto: UpdateBorrowRequestDto) {
    const request = await this.findOne(id);
    if (request.status === BorrowRequestStatus.RETURNED) {
      throw new BadRequestException('Cannot edit a returned borrow request.');
    }

    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.transactionType) data.transactionType = dto.transactionType;
    if (dto.notes) data.decisionNotes = dto.notes;
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);

    await this.prisma.borrowRequest.update({
      where: { id },
      data,
    });

    await this.auditLogService.log({
      action: 'UPDATE_BORROW',
      entityType: 'BorrowRequest',
      entityId: id,
      description: `Borrow request updated`,
      performedById: userId,
    });

    return this.findOne(id);
  }

  // ---------- HELPER ----------
  private async generateTransactionControlNo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.sequenceCounter.upsert({
      where: { type_year: { type: 'ITEM_TRANSACTION', year } },
      update: { count: { increment: 1 } },
      create: { type: 'ITEM_TRANSACTION', year, count: 1 },
    });
    return `TXN-${year}-${String(seq.count).padStart(6, '0')}`;
  }
}
