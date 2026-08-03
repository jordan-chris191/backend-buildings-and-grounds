// src/positions/positions.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.position.findMany({ orderBy: { name: 'asc' } });
  }
}