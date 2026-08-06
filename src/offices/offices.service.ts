import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { Campus } from '@prisma/client';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfficeDto) {
    // Check uniqueness manually if needed (Prisma will throw P2002 anyway)
    return this.prisma.office.create({ data: dto });
  }

  async findAll(campus?: Campus) {
    return this.prisma.office.findMany({
      where: {
        isActive: true,
        ...(campus && { campus }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({ where: { id } });
    if (!office) throw new NotFoundException('Office not found.');
    return office;
  }

  async update(id: string, dto: UpdateOfficeDto) {
    await this.findOne(id);
    return this.prisma.office.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft delete
    return this.prisma.office.update({
      where: { id },
      data: { isActive: false },
    });
  }
}