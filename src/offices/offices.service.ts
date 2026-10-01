import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { Campus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(dto: CreateOfficeDto, performedById: string) {
    try {
      const office = await this.prisma.office.create({ data: dto });
      await this.audit.log({ action: 'OFFICE_CREATED', entityType: 'Office', entityId: office.id, description: `Created office ${office.name} (${office.campus})`, performedById });
      return office;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('An Office with this name already exists at this campus');
      throw error;
    }
  }

  async findAll(query: { campus?: Campus; search?: string; isActive?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const isActive = query.isActive === undefined ? true : query.isActive === 'true';
    const where = { isActive, ...(query.campus ? { campus: query.campus } : {}), ...(query.search?.trim() ? { name: { contains: query.search.trim(), mode: 'insensitive' as const } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.office.findMany({ where, include: { _count: { select: { users: { where: { isActive: true } } } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.office.count({ where }),
    ]);
    const offices = data.map(({ _count, ...office }) => ({ ...office, activeUserCount: _count.users }));
    // Retain the established array contract for existing consumers that do not
    // request pagination; management clients can opt in with page or limit.
    if (query.page === undefined && query.limit === undefined) return offices;
    return { data: offices, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({ where: { id } });
    if (!office) throw new NotFoundException('Office not found.');
    return office;
  }

  async update(id: string, dto: UpdateOfficeDto, performedById: string) {
    const before = await this.findOne(id);
    const office = await this.prisma.office.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({ action: 'OFFICE_UPDATED', entityType: 'Office', entityId: id, description: `Updated office ${before.name}`, metadata: { previous: { name: before.name, campus: before.campus, isActive: before.isActive }, next: { name: office.name, campus: office.campus, isActive: office.isActive } }, performedById });
    return office;
  }

  async remove(id: string, performedById: string) {
    await this.findOne(id);
    // Soft delete
    const office = await this.prisma.office.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({ action: 'OFFICE_DEACTIVATED', entityType: 'Office', entityId: id, description: `Deactivated office ${office.name}`, performedById });
    return office;
  }

  async reactivate(id: string, performedById: string) {
    await this.findOne(id);
    const office = await this.prisma.office.update({ where: { id }, data: { isActive: true } });
    await this.audit.log({ action: 'OFFICE_REACTIVATED', entityType: 'Office', entityId: id, description: `Reactivated office ${office.name}`, performedById });
    return office;
  }
}
