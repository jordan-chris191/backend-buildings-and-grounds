import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateAssetTransferDto } from './dto/create-asset-transfer.dto';

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
  };

  async create(userId: string, dto: CreateAssetTransferDto) {
    return this.prisma.assetTransfer.create({
      data: {
        fromCampus: dto.fromCampus,
        toCampus: dto.toCampus,
        reason: dto.reason,
        transferDate: dto.transferDate ? new Date(dto.transferDate) : new Date(),
        inventoryItemId: dto.inventoryItemId,
        transferredById: userId,
        status: TransferStatus.PENDING,
      },
      include: this.defaultInclude,
    });
  }

  async findAll(status?: TransferStatus) {
    return this.prisma.assetTransfer.findMany({
      where: {
        ...(status && { status }),
      },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.assetTransfer.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!transfer) throw new NotFoundException('Asset transfer not found.');
    return transfer;
  }

  async approve(id: string, userId: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Only PENDING transfers can be approved.');
    }
    return this.prisma.assetTransfer.update({
      where: { id },
      data: {
        status: TransferStatus.APPROVED,
        approvedById: userId,
      },
      include: this.defaultInclude,
    });
  }

  async reject(id: string, userId: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Only PENDING transfers can be rejected.');
    }
    return this.prisma.assetTransfer.update({
      where: { id },
      data: {
        status: TransferStatus.REJECTED,
        approvedById: userId,
      },
      include: this.defaultInclude,
    });
  }

  async receive(id: string, userId: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== TransferStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED transfers can be received.');
    }

    // Update inventory item's campus to toCampus
    await this.prisma.inventoryItem.update({
      where: { id: transfer.inventoryItemId },
      data: { campus: transfer.toCampus },
    });

    return this.prisma.assetTransfer.update({
      where: { id },
      data: {
        status: TransferStatus.COMPLETED,
        receivedById: userId,
      },
      include: this.defaultInclude,
    });
  }
}