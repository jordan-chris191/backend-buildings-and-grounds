import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  PurchaseRequestStatus,
  StockMovementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private defaultInclude = {
    items: {
      include: { materialEstimate: true },
    },
    project: { select: { id: true, name: true, campus:true } },
    requestedBy: { select: { id: true, firstName: true, lastName: true } },
    approvedBy: { select: { id: true, firstName: true, lastName: true } },
    budgetAllocation: true,
    requestingOffice: true,
  };

  async create(userId: string, dto: CreatePurchaseRequestDto) {
    const controlNo = await this.generateControlNo();

    return this.prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseRequest.create({
        data: {
          controlNo,
          purpose: dto.purpose,
          status: PurchaseRequestStatus.DRAFT,
          projectId: dto.projectId,
          budgetAllocationId: dto.budgetAllocationId,
          requestingOfficeId: dto.requestingOfficeId,
          requestedById: userId,
          items: {
            create: dto.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
              materialEstimateId: item.materialEstimateId,
            })),
          },
        },
        include: this.defaultInclude,
      });

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'PurchaseRequest',
        entityId: pr.id,
        description: `Created purchase request ${controlNo}`,
        performedById: userId,
      });

      return pr;
    });
  }

  private async generateControlNo(): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'PURCHASE_REQUEST', year } },
      update: { count: { increment: 1 } },
      create: { type: 'PURCHASE_REQUEST', year, count: 1 },
    });
    const seq = String(sequence.count).padStart(4, '0');
    return `PR-${year}-${seq}`;
  }

  async findAll(status?: PurchaseRequestStatus) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        isActive: true,
        ...(status && { status }),
      },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!pr) throw new NotFoundException('Purchase request not found.');
    return pr;
  }

  async update(id: string, userId: string, dto: UpdatePurchaseRequestDto) {
    const pr = await this.findOne(id);
    if (pr.status !== PurchaseRequestStatus.DRAFT && pr.status !== PurchaseRequestStatus.PENDING) {
      throw new BadRequestException('Can only update DRAFT or PENDING requests.');
    }
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { ...dto },
      include: this.defaultInclude,
    });
  }

  async submit(id: string, userId: string) {
    const pr = await this.findOne(id);
    if (pr.status !== PurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT requests can be submitted.');
    }
    await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.PENDING },
    });
    return this.findOne(id);
  }

  async approve(id: string, userId: string) {
    const pr = await this.findOne(id);
    if (pr.status !== PurchaseRequestStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be approved.');
    }
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
      include: this.defaultInclude,
    });
  }

  async reject(id: string, userId: string) {
    const pr = await this.findOne(id);
    if (pr.status !== PurchaseRequestStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be rejected.');
    }
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        approvedById: userId,
        approvedAt: new Date(),
      },
      include: this.defaultInclude,
    });
  }

  async complete(id: string, userId: string) {
    const pr = await this.findOne(id);
    if (pr.status !== PurchaseRequestStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED requests can be completed.');
    }

    // This is a critical operation: we need to create inventory items and stock movements.
    // Assuming each PR item corresponds to a new inventory item.
    return this.prisma.$transaction(async (tx) => {
      for (const item of pr.items) {
        // Create inventory item
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            name: item.description, // simple mapping
            type: 'CONSUMABLE', // or you may infer from other data; here defaulting
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            campus: pr.project?.campus || 'MC1', // fallback
            sourcePurchaseRequestId: id,
          },
        });

        // Create stock movement (received)
        await tx.stockMovement.create({
          data: {
            movementType: StockMovementType.RECEIVED,
            quantityChange: item.quantity,
            quantityAfter: item.quantity,
            reason: `Received from purchase request ${pr.controlNo}`,
            inventoryItemId: inventoryItem.id,
            performedById: userId,
            purchaseRequestId: id,
          },
        });
      }

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.COMPLETED },
      });

      await this.auditLogService.log({
        action: 'COMPLETE',
        entityType: 'PurchaseRequest',
        entityId: id,
        description: `Completed purchase request ${pr.controlNo}`,
        performedById: userId,
      });

      return this.findOne(id);
    });
  }

  async cancel(id: string, userId: string) {
  const pr = await this.findOne(id);
  if (pr.status === PurchaseRequestStatus.COMPLETED) {
    throw new BadRequestException('Completed requests cannot be cancelled.');
  }
  await this.prisma.purchaseRequest.update({
    where: { id },
    data: { isActive: false },   // ← removed the invalid status change
  });
  await this.auditLogService.log({
    action: 'CANCEL',
    entityType: 'PurchaseRequest',
    entityId: id,
    description: `Cancelled purchase request ${pr.controlNo}`,
    performedById: userId,
  });
  return { message: 'Purchase request cancelled.' };
}
}