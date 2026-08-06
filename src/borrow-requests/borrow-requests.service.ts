// src/borrow-requests/borrow-requests.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

@Injectable()
export class BorrowRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly gateway: BorrowRequestsGateway,
  ) {}

  private include = {
    inventoryItem: true,
    requestedBy: { select: { id: true, firstName: true, lastName: true } },
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
    const request = await this.findOne(id);
    if (request.status !== BorrowRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved.');
    }

    const type = dto.transactionType ?? TransactionType.ISSUANCE;
    const notes = dto.notes;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : request.dueDate;

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id: request.inventoryItemId },
      });
      if (!item) throw new NotFoundException('Item no longer exists.');

      const itemQty = item.quantity.toNumber();
      const reqQty = request.quantity.toNumber();

      // ---------- BRANCH 1: ISSUANCE ----------
      if (type === TransactionType.ISSUANCE) {
        if (itemQty < reqQty) {
          throw new BadRequestException('Insufficient stock at time of approval.');
        }

        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: {
            quantity: { decrement: request.quantity },
            status: ItemStatus.BORROWED,
          },
        });

        const controlNo = await this.generateTransactionControlNo();
        const transaction = await tx.itemTransaction.create({
          data: {
            controlNumber: controlNo,
            transactionType: TransactionType.ISSUANCE,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: adminId,
            transactionDate: new Date(),
            notes: `Borrow request approved (ISSUANCE): ${request.id}`,
          },
        });

        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.WITHDRAWN,
            quantityChange: request.quantity.mul(-1),
            quantityAfter: new Prisma.Decimal(itemQty - reqQty),
            reason: `Borrow approved (ISSUANCE): ${request.id}`,
            inventoryItemId: request.inventoryItemId,
            performedById: adminId,
            referenceType: 'BorrowRequest',
            referenceId: request.id,
          },
        });

        await tx.borrowRequest.update({
          where: { id },
          data: {
            status: BorrowRequestStatus.APPROVED,
            approvedById: adminId,
            approvedAt: new Date(),
            transactionId: transaction.id,
            decisionNotes: notes,
            dueDate: dueDate,
          },
        });
      }

      // ---------- BRANCH 2: WITHDRAWAL ----------
      else if (type === TransactionType.WITHDRAWAL) {
        if (itemQty < reqQty) {
          throw new BadRequestException('Insufficient stock at time of approval.');
        }

        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: {
            quantity: { decrement: request.quantity },
          },
        });

        const controlNo = await this.generateTransactionControlNo();
        const transaction = await tx.itemTransaction.create({
          data: {
            controlNumber: controlNo,
            transactionType: TransactionType.WITHDRAWAL,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: adminId,
            transactionDate: new Date(),
            notes: `Borrow request approved (WITHDRAWAL): ${request.id}`,
          },
        });

        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.WITHDRAWN,
            quantityChange: request.quantity.mul(-1),
            quantityAfter: new Prisma.Decimal(itemQty - reqQty),
            reason: `Borrow approved (WITHDRAWAL): ${request.id}`,
            inventoryItemId: request.inventoryItemId,
            performedById: adminId,
            referenceType: 'BorrowRequest',
            referenceId: request.id,
          },
        });

        await tx.borrowRequest.update({
          where: { id },
          data: {
            status: BorrowRequestStatus.APPROVED,
            approvedById: adminId,
            approvedAt: new Date(),
            transactionId: transaction.id,
            decisionNotes: notes,
            dueDate: dueDate,
          },
        });
      }

      // ---------- BRANCH 3: RETURN ----------
      else if (type === TransactionType.RETURN) {
        const newQty = itemQty + reqQty;
        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: {
            quantity: { increment: request.quantity },
          },
        });

        const controlNo = await this.generateTransactionControlNo();
        await tx.itemTransaction.create({
          data: {
            controlNumber: controlNo,
            transactionType: TransactionType.RETURN,
            inventoryItemId: request.inventoryItemId,
            quantity: request.quantity,
            custodianId: adminId,
            transactionDate: new Date(),
            notes: `Borrow request closed as RETURN (direct): ${request.id}`,
          },
        });

        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.RETURNED,
            quantityChange: request.quantity,
            quantityAfter: new Prisma.Decimal(newQty),
            reason: `Borrow approved as RETURN: ${request.id}`,
            inventoryItemId: request.inventoryItemId,
            performedById: adminId,
            referenceType: 'BorrowRequest',
            referenceId: request.id,
          },
        });

        await tx.borrowRequest.update({
          where: { id },
          data: {
            status: BorrowRequestStatus.RETURNED,
            approvedById: adminId,
            approvedAt: new Date(),
            decisionNotes: notes,
            dueDate: dueDate,
            returnedAt: new Date(),
          },
        });
      }

      await this.auditLogService.log({
        action: 'APPROVE_BORROW',
        entityType: 'BorrowRequest',
        entityId: id,
        description: `Borrow request approved as ${type}`,
        performedById: adminId,
      });

      return tx.borrowRequest.findUnique({
        where: { id },
        include: this.include,
      });
    });

    // ✅ Notify the requester
    if (updatedRequest) {
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: updatedRequest.status,
        message: `✅ Your borrow request for "${updatedRequest.inventoryItem.name}" has been approved!`,
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

    // ✅ Notify the requester
    this.gateway.notifyUser(updatedRequest.requestedById, {
      requestId: id,
      status: 'REJECTED',
      message: `❌ Your borrow request for "${updatedRequest.inventoryItem.name}" has been rejected.`,
      
    });

    return updatedRequest;
  }

  // ---------- RETURN ----------
  async markReturned(id: string, userId: string) {
    const request = await this.findOne(id);
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
        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: {
            quantity: { increment: request.quantity },
            status: ItemStatus.GOOD_CONDITION,
          },
        });

        const controlNo = await this.generateTransactionControlNo();
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

        const item = await tx.inventoryItem.findUnique({
          where: { id: request.inventoryItemId },
        });
        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.RETURNED,
            quantityChange: request.quantity,
            quantityAfter: item!.quantity,
            reason: `Borrow returned: ${request.id}`,
            inventoryItemId: request.inventoryItemId,
            performedById: userId,
            referenceType: 'BorrowRequest',
            referenceId: request.id,
          },
        });

        return tx.borrowRequest.update({
          where: { id },
          data: {
            status: BorrowRequestStatus.RETURNED,
            returnedAt: new Date(),
          },
          include: this.include,
        });
      });

      if (!updatedRequest) {
        throw new NotFoundException('Failed to update borrow request.');
      }

      await this.auditLogService.log({
        action: 'RETURN_BORROW',
        entityType: 'BorrowRequest',
        entityId: id,
        description: `Borrow request returned (ISSUANCE)`,
        performedById: userId,
      });

      // ✅ Notify the requester
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: 'RETURNED',
        message: `🔄 The item "${updatedRequest.inventoryItem.name}" has been returned.`,
        
      });

      return updatedRequest;
    } 
    
    else if (transactionType === TransactionType.WITHDRAWAL) {
      const updatedRequest = await this.prisma.borrowRequest.update({
        where: { id },
        data: {
          status: BorrowRequestStatus.RETURNED,
          returnedAt: new Date(),
        },
        include: this.include,
      });

      await this.auditLogService.log({
        action: 'RETURN_BORROW',
        entityType: 'BorrowRequest',
        entityId: id,
        description: `Borrow request closed-out (WITHDRAWAL)`,
        performedById: userId,
      });

      // ✅ Notify the requester
      this.gateway.notifyUser(updatedRequest.requestedById, {
        requestId: id,
        status: 'RETURNED',
        message: `📄 Your borrow request for "${updatedRequest.inventoryItem.name}" has been closed.`,
      
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
    performedById: userId, // ✅ Use the actual user ID
  });

  return this.findOne(id);
}

  // ---------- HELPER ----------
  private async generateTransactionControlNo(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'ITEM_TRANSACTION', year } },
      update: { count: { increment: 1 } },
      create: { type: 'ITEM_TRANSACTION', year, count: 1 },
    });
    return `TXN-${year}-${String(seq.count).padStart(6, '0')}`;
  }
}