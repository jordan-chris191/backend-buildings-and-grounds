import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(dto: CreatePositionDto, performedById: string) {
    try {
      const position = await this.prisma.position.create({ data: dto });
      await this.audit.log({ action: 'POSITION_CREATED', entityType: 'Position', entityId: position.id, description: `Created position ${position.name}`, performedById });
      return position;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A Position with this name already exists');
      throw error;
    }
  }

  async findAll(search?: string, isActive?: string) {
    return this.prisma.position.findMany({ where: { isActive: isActive === undefined ? true : isActive === 'true', ...(search?.trim() ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}) }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  async findOne(id: string) {
    const pos = await this.prisma.position.findUnique({ where: { id } });
    if (!pos) throw new NotFoundException('Position not found');
    return pos;
  }

  async update(id: string, dto: UpdatePositionDto, performedById: string) {
    const before = await this.findOne(id);
    const position = await this.prisma.position.update({ where: { id }, data: dto });
    await this.audit.log({ action: 'POSITION_UPDATED', entityType: 'Position', entityId: id, description: `Updated position ${before.name}`, metadata: { previous: { name: before.name, isActive: before.isActive }, next: { name: position.name, isActive: position.isActive } }, performedById });
    return position;
  }

  async remove(id: string, performedById: string) {
    await this.findOne(id);
    const position = await this.prisma.position.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ action: 'POSITION_DEACTIVATED', entityType: 'Position', entityId: id, description: `Deactivated position ${position.name}`, performedById });
    return position;
  }

  async reactivate(id: string, performedById: string) {
    await this.findOne(id);
    const position = await this.prisma.position.update({ where: { id }, data: { isActive: true } });
    await this.audit.log({ action: 'POSITION_REACTIVATED', entityType: 'Position', entityId: id, description: `Reactivated position ${position.name}`, performedById });
    return position;
  }
}
