import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnualBudgetDto } from './dto/create-annual-budget.dto';
import { UpdateAnnualBudgetDto } from './dto/update-annual-budget.dto';
import { CreateBudgetAllocationDto } from './dto/create-budget-allocation.dto';
import { UpdateBudgetAllocationDto } from './dto/update-budget-allocation.dto';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Annual Budgets ---
  async createBudget(dto: CreateAnnualBudgetDto) {
    return this.prisma.annualBudget.create({
      data: {
        year: dto.year,
        totalAmount: dto.totalAmount,
        description: dto.description,
      },
    });
  }

  async getAllBudgets() {
    return this.prisma.annualBudget.findMany({
      where: { isActive: true },
      include: {
        allocations: {
          where: { isActive: true },
          include: { project: { select: { id: true, name: true } } },
        },
      },
      orderBy: { year: 'desc' },
    });
  }

  async getBudgetById(id: string) {
    const budget = await this.prisma.annualBudget.findUnique({
      where: { id },
      include: {
        allocations: {
          where: { isActive: true },
          include: { project: { select: { id: true, name: true } } },
        },
      },
    });
    if (!budget) throw new NotFoundException('Annual budget not found.');
    return budget;
  }

  async updateBudget(id: string, dto: UpdateAnnualBudgetDto) {
    await this.getBudgetById(id);
    return this.prisma.annualBudget.update({
      where: { id },
      data: dto,
    });
  }

  async deleteBudget(id: string) {
    await this.getBudgetById(id);
    return this.prisma.annualBudget.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // --- Budget Allocations ---
  async createAllocation(dto: CreateBudgetAllocationDto) {
    // Check budget exists and has enough remaining funds
    const budget = await this.prisma.annualBudget.findUnique({
      where: { id: dto.annualBudgetId },
      include: { allocations: { where: { isActive: true } } },
    });
    if (!budget) throw new NotFoundException('Annual budget not found.');

    const totalAllocated = budget.allocations.reduce(
      (sum, a) => sum + a.allocatedAmount.toNumber(),
      0,
    );
    const newTotal = totalAllocated + dto.allocatedAmount;
    if (newTotal > budget.totalAmount.toNumber()) {
      throw new BadRequestException(
        `Exceeds budget. Remaining: ${budget.totalAmount.toNumber() - totalAllocated}`,
      );
    }

    return this.prisma.budgetAllocation.create({
      data: {
        name: dto.name,
        trade: dto.trade,
        allocatedAmount: dto.allocatedAmount,
        annualBudgetId: dto.annualBudgetId,
        projectId: dto.projectId,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async getAllocationsByBudget(budgetId: string) {
    return this.prisma.budgetAllocation.findMany({
      where: { annualBudgetId: budgetId, isActive: true },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async getAllocationById(id: string) {
    const allocation = await this.prisma.budgetAllocation.findUnique({
      where: { id },
      include: {
        annualBudget: true,
        project: { select: { id: true, name: true } },
      },
    });
    if (!allocation) throw new NotFoundException('Allocation not found.');
    return allocation;
  }

  async updateAllocation(id: string, dto: UpdateBudgetAllocationDto) {
    const allocation = await this.getAllocationById(id);
    if (dto.allocatedAmount !== undefined) {
  // Recalculate budget limit
  const budget = await this.prisma.annualBudget.findUnique({
    where: { id: allocation.annualBudgetId },
    include: { allocations: { where: { isActive: true } } },
  });
  if (!budget) throw new NotFoundException('Annual budget not found.');

  const totalWithoutCurrent = budget.allocations
    .filter((a) => a.id !== id)
    .reduce((sum, a) => sum + a.allocatedAmount.toNumber(), 0);
  const newTotal = totalWithoutCurrent + dto.allocatedAmount;
  if (newTotal > budget.totalAmount.toNumber()) {
    throw new BadRequestException(
      `Exceeds budget. Remaining: ${budget.totalAmount.toNumber() - totalWithoutCurrent}`,
    );
  }
}
    return this.prisma.budgetAllocation.update({
      where: { id },
      data: dto,
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async deleteAllocation(id: string) {
    await this.getAllocationById(id);
    return this.prisma.budgetAllocation.update({
      where: { id },
      data: { isActive: false },
    });
  }
}