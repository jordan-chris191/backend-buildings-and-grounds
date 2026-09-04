import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateAssetTypeConfigDto } from './dto/create-asset-type-config.dto';
import { UpdateAssetTypeConfigDto } from './dto/update-asset-type-config.dto';

@Injectable()
export class AssetTypeConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private readonly defaultInclude = {
    position: true,
  };

  async create(userId: string, dto: CreateAssetTypeConfigDto) {
    const existing = await this.prisma.assetTypeConfig.findUnique({
      where: { assetType: dto.assetType },
    });
    if (existing) {
      throw new ConflictException(
        `A config for ${dto.assetType} already exists. Update it instead of creating a new one.`,
      );
    }

    const position = await this.prisma.position.findUnique({
      where: { id: dto.positionId },
    });
    if (!position) {
      throw new BadRequestException('Position not found.');
    }

    const config = await this.prisma.assetTypeConfig.create({
      data: {
        assetType: dto.assetType,
        positionId: dto.positionId,
        notes: dto.notes,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'CREATE',
      entityType: 'AssetTypeConfig',
      entityId: config.id,
      description: `Mapped ${config.assetType} maintenance to position "${position.name}"`,
      performedById: userId,
    });

    return config;
  }

  async findAll() {
    return this.prisma.assetTypeConfig.findMany({
      where: { isActive: true },
      include: this.defaultInclude,
      orderBy: { assetType: 'asc' },
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.assetTypeConfig.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!config) {
      throw new NotFoundException('Asset type config not found.');
    }
    return config;
  }

  async update(id: string, userId: string, dto: UpdateAssetTypeConfigDto) {
    const config = await this.findOne(id);

    if (dto.positionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: dto.positionId },
      });
      if (!position) {
        throw new BadRequestException('Position not found.');
      }
    }

    const updated = await this.prisma.assetTypeConfig.update({
      where: { id },
      data: {
        positionId: dto.positionId,
        notes: dto.notes,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'AssetTypeConfig',
      entityId: id,
      description: `Updated ${config.assetType} maintenance position mapping`,
      performedById: userId,
    });

    return updated;
  }

  async deactivate(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.assetTypeConfig.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DEACTIVATE',
      entityType: 'AssetTypeConfig',
      entityId: id,
      description: `Deactivated asset type config ${id}`,
      performedById: userId,
    });

    return { message: 'Asset type config deactivated.' };
  }
}