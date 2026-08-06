import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PersonType } from '@prisma/client';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto) {
    return this.prisma.person.create({ data: dto });
  }

  async findAll(type?: PersonType, search?: string) {
    return this.prisma.person.findMany({
      where: {
        isActive: true,
        ...(type && { type }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { studentId: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Person not found.');
    return person;
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    return this.prisma.person.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft delete by setting isActive = false
    return this.prisma.person.update({
      where: { id },
      data: { isActive: false },
    });
  }
}