// src/withdrawals/withdrawals.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  private async generateSlipNo(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'WH', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WH', year, count: 1 },
    });
    return `WH-${year}-${counter.count.toString().padStart(4, '0')}`;
  }

  async create(custodianId: string, dto: CreateWithdrawalDto) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    const availableQuantity = Number(item.quantity);
    if (availableQuantity < dto.quantity) {
      throw new BadRequestException(
        `Not enough stock. Available: ${availableQuantity}, requested: ${dto.quantity}`,
      );
    }

    const issuanceSlipNo = await this.generateSlipNo();
    const newQuantity = availableQuantity - dto.quantity;
    const unitCost = item.unitCost != null ? Number(item.unitCost) : undefined;
    const newTotalValue = unitCost != null ? unitCost * newQuantity : undefined;

    const [withdrawal] = await this.prisma.$transaction([
      this.prisma.warehouseWithdrawal.create({
        data: {
          issuanceSlipNo,
          inventoryItemId: dto.inventoryItemId,
          quantity: dto.quantity,
          withdrawnByName: dto.withdrawnByName,
          custodianId,
        },
      }),
      this.prisma.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: { quantity: newQuantity, totalValue: newTotalValue },
      }),
    ]);

    await this.prisma.stockMovement.create({
      data: {
        movementType: 'WITHDRAWN',
        quantityChange: -dto.quantity,
        quantityAfter: newQuantity,
        referenceType: 'WarehouseWithdrawal',
        referenceId: withdrawal.id,
        inventoryItemId: dto.inventoryItemId,
        performedById: custodianId,
      },
    });

    await this.auditLogService.log({
      action: 'WITHDRAW',
      entityType: 'WarehouseWithdrawal',
      entityId: withdrawal.id,
      description: `Withdrew ${dto.quantity} ${item.unit ?? ''} of "${item.name}" (Slip ${issuanceSlipNo})`,
      performedById: custodianId,
    });

    return withdrawal;
  }

  async findAll() {
    return this.prisma.warehouseWithdrawal.findMany({
      orderBy: { withdrawnAt: 'desc' },
      include: { inventoryItem: true, custodian: true },
    });
  }

  async findOne(id: string) {
    const withdrawal = await this.prisma.warehouseWithdrawal.findUnique({
      where: { id },
      include: { inventoryItem: true, custodian: true },
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal record not found');
    }
    return withdrawal;
  }
}