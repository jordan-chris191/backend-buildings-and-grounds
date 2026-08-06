import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    return this.prisma.itemCategory.create({ data: dto });
  }

  async findAll() {
    return this.prisma.itemCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const cat = await this.prisma.itemCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.itemCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft delete
    return this.prisma.itemCategory.update({ where: { id }, data: { isActive: false } });
  }
}