import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateMaintenanceUnitTypeConfigDto } from './dto/create-maintenance-unit-type-config.dto';
import { UpdateMaintenanceUnitTypeConfigDto } from './dto/update-maintenance-unit-type-config.dto';

@Injectable()
export class MaintenanceUnitTypeConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateMaintenanceUnitTypeConfigDto) {
    const existing = await this.prisma.maintenanceUnitTypeConfig.findUnique({
      where: { unitType: dto.unitType },
    });
    if (existing) {
      throw new ConflictException(
        `A unit type config for "${dto.unitType}" already exists.`,
      );
    }

    const config = await this.prisma.maintenanceUnitTypeConfig.create({
      data: {
        unitType: dto.unitType,
        defaultCooldownDays: dto.defaultCooldownDays,
        notes: dto.notes,
      },
    });

    await this.auditLogService.log({
      action: 'CREATE',
      entityType: 'MaintenanceUnitTypeConfig',
      entityId: config.id,
      description: `Created unit type config "${config.unitType}" (${config.defaultCooldownDays}-day cooldown)`,
      performedById: userId,
    });

    return config;
  }

  async findAll() {
    return this.prisma.maintenanceUnitTypeConfig.findMany({
      where: { isActive: true },
      orderBy: { unitType: 'asc' },
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.maintenanceUnitTypeConfig.findUnique({
      where: { id },
    });
    if (!config) {
      throw new NotFoundException('Unit type config not found.');
    }
    return config;
  }

  async update(id: string, userId: string, dto: UpdateMaintenanceUnitTypeConfigDto) {
    await this.findOne(id);

    const updated = await this.prisma.maintenanceUnitTypeConfig.update({
      where: { id },
      data: {
        defaultCooldownDays: dto.defaultCooldownDays,
        notes: dto.notes,
      },
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'MaintenanceUnitTypeConfig',
      entityId: id,
      description: `Updated unit type config "${updated.unitType}"`,
      performedById: userId,
    });

    return updated;
  }

  async deactivate(id: string, userId: string) {
    const config = await this.findOne(id);

    const profilesInUse = await this.prisma.maintainableAssetProfile.count({
      where: { unitTypeConfigId: id, isActive: true },
    });
    if (profilesInUse > 0) {
      throw new ConflictException(
        `Cannot deactivate: ${profilesInUse} active asset profile(s) still reference "${config.unitType}".`,
      );
    }

    await this.prisma.maintenanceUnitTypeConfig.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DEACTIVATE',
      entityType: 'MaintenanceUnitTypeConfig',
      entityId: id,
      description: `Deactivated unit type config "${config.unitType}"`,
      performedById: userId,
    });

    return { message: 'Unit type config deactivated.' };
  }
}