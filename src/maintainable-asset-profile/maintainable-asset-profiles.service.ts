import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateMaintainableAssetProfileDto } from './dto/create-maintainable-asset-profile.dto';
import { UpdateMaintainableAssetProfileDto } from './dto/update-maintainable-asset-profile.dto';

@Injectable()
export class MaintainableAssetProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private readonly defaultInclude = {
    inventoryItem: true,
    unitTypeConfig: true,
  };

  async create(userId: string, dto: CreateMaintainableAssetProfileDto) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
      include: { maintainableAssetProfile: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }
    if (item.maintainableAssetProfile) {
      throw new ConflictException(
        'This inventory item already has a maintainable-asset profile.',
      );
    }

    if (dto.unitTypeConfigId) {
      const config = await this.prisma.maintenanceUnitTypeConfig.findUnique({
        where: { id: dto.unitTypeConfigId },
      });
      if (!config) {
        throw new BadRequestException('Unknown unit type config.');
      }
    }

    const profile = await this.prisma.maintainableAssetProfile.create({
      data: {
        inventoryItemId: dto.inventoryItemId,
        assetType: dto.assetType,
        priority: dto.priority,
        unitTypeConfigId: dto.unitTypeConfigId,
        notes: dto.notes,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'CREATE',
      entityType: 'MaintainableAssetProfile',
      entityId: profile.id,
      description: `Tagged inventory item "${item.name}" as maintainable (${profile.assetType})`,
      performedById: userId,
    });

    return profile;
  }

  async findAll(assetType?: string) {
    return this.prisma.maintainableAssetProfile.findMany({
      where: {
        isActive: true,
        ...(assetType && { assetType: assetType as any }),
      },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const profile = await this.prisma.maintainableAssetProfile.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!profile) {
      throw new NotFoundException('Maintainable asset profile not found.');
    }
    return profile;
  }

  async findByInventoryItem(inventoryItemId: string) {
    const profile = await this.prisma.maintainableAssetProfile.findUnique({
      where: { inventoryItemId },
      include: this.defaultInclude,
    });
    if (!profile) {
      throw new NotFoundException(
        'This inventory item has no maintainable-asset profile.',
      );
    }
    return profile;
  }

  async update(id: string, userId: string, dto: UpdateMaintainableAssetProfileDto) {
    const profile = await this.findOne(id);

    if (dto.unitTypeConfigId) {
      const config = await this.prisma.maintenanceUnitTypeConfig.findUnique({
        where: { id: dto.unitTypeConfigId },
      });
      if (!config) {
        throw new BadRequestException('Unknown unit type config.');
      }
    }

    const updated = await this.prisma.maintainableAssetProfile.update({
      where: { id },
      data: {
        assetType: dto.assetType,
        priority: dto.priority,
        unitTypeConfigId: dto.unitTypeConfigId,
        notes: dto.notes,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'MaintainableAssetProfile',
      entityId: id,
      description: `Updated maintainable-asset profile for item ${profile.inventoryItemId}`,
      performedById: userId,
    });

    return updated;
  }

  async deactivate(id: string, userId: string) {
    const profile = await this.findOne(id);

    // Guard: don't let a profile disappear while active schedules still point at it,
    // since MaintenanceSchedule requires a profile to exist per the create() check there.
    const activeSchedules = await this.prisma.maintenanceSchedule.count({
      where: { inventoryItemId: profile.inventoryItemId, isActive: true },
    });
    if (activeSchedules > 0) {
      throw new ConflictException(
        `Cannot deactivate: ${activeSchedules} active maintenance schedule(s) still reference this item. Deactivate those first.`,
      );
    }

    await this.prisma.maintainableAssetProfile.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DEACTIVATE',
      entityType: 'MaintainableAssetProfile',
      entityId: id,
      description: `Deactivated maintainable-asset profile ${id}`,
      performedById: userId,
    });

    return { message: 'Maintainable asset profile deactivated.' };
  }
}