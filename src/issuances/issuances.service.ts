// src/issuances/issuances.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateIssuanceDto } from './dto/create-issuance.dto';

@Injectable()
export class IssuancesService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  private async generateControlNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'ISS', year } },
      update: { count: { increment: 1 } },
      create: { type: 'ISS', year, count: 1 },
    });
    return `ISS-${year}-${counter.count.toString().padStart(4, '0')}`;
  }

  async create(custodianId: string, dto: CreateIssuanceDto) {
    if (!dto.studentId && !dto.contactNumber) {
      throw new BadRequestException(
        'Either studentId or contactNumber must be provided',
      );
    }

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    const controlNumber = await this.generateControlNumber();

    const issuance = await this.prisma.itemIssuance.create({
      data: {
        controlNumber,
        inventoryItemId: dto.inventoryItemId,
        quantity: dto.quantity ?? 1,
        borrowerName: dto.borrowerName,
        studentId: dto.studentId,
        contactNumber: dto.contactNumber,
        dueBackAt: dto.dueBackAt ? new Date(dto.dueBackAt) : undefined,
        custodianId,
      },
    });

    await this.auditLogService.log({
      action: 'ISSUE',
      entityType: 'ItemIssuance',
      entityId: issuance.id,
      description: `Issued "${item.name}" to ${dto.borrowerName} (${controlNumber})`,
      performedById: custodianId,
    });

    return issuance;
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.itemIssuance.findMany({
      where: activeOnly ? { returnedAt: null } : {},
      orderBy: { issuedAt: 'desc' },
      include: { inventoryItem: true, custodian: true },
    });
  }

  async findOne(id: string) {
    const issuance = await this.prisma.itemIssuance.findUnique({
      where: { id },
      include: { inventoryItem: true, custodian: true },
    });
    if (!issuance) {
      throw new NotFoundException('Issuance record not found');
    }
    return issuance;
  }

  async markReturned(id: string, performedById: string) {
    const issuance = await this.findOne(id);

    if (issuance.returnedAt) {
      throw new BadRequestException('This item has already been returned');
    }

    const updated = await this.prisma.itemIssuance.update({
      where: { id },
      data: { returnedAt: new Date() },
    });

    await this.auditLogService.log({
      action: 'RETURN',
      entityType: 'ItemIssuance',
      entityId: id,
      description: `Returned "${issuance.inventoryItem.name}" from ${issuance.borrowerName} (${issuance.controlNumber})`,
      performedById,
    });

    return updated;
  }
}