// src/projects/projects.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateMaterialEstimateDto } from './dto/create-material-estimate.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        type: dto.type,
        campus: dto.campus,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { materialEstimates: true, items: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async createEstimate(dto: CreateMaterialEstimateDto) {
    await this.findOne(dto.projectId); // confirms project exists

    return this.prisma.materialEstimate.create({
      data: {
        projectId: dto.projectId,
        category: dto.category,
        itemNo: dto.itemNo,
        description: dto.description,
        quantity: dto.quantity,
        unit: dto.unit,
        unitCost: dto.unitCost,
        amount: dto.quantity * dto.unitCost,
      },
    });
  }

  async getEstimates(projectId: string) {
    await this.findOne(projectId);
    return this.prisma.materialEstimate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }
}