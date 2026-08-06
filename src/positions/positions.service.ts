import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePositionDto) {
    return this.prisma.position.create({ data: dto });
  }

  async findAll() {
    return this.prisma.position.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const pos = await this.prisma.position.findUnique({ where: { id } });
    if (!pos) throw new NotFoundException('Position not found');
    return pos;
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.findOne(id);
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.position.update({ where: { id }, data: { isActive: false } });
  }
}