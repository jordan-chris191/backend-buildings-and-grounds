import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { BudgetService } from './budget.service';
import { CreateAnnualBudgetDto } from './dto/create-annual-budget.dto';
import { UpdateAnnualBudgetDto } from './dto/update-annual-budget.dto';
import { CreateBudgetAllocationDto } from './dto/create-budget-allocation.dto';
import { UpdateBudgetAllocationDto } from './dto/update-budget-allocation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // --- Annual Budgets ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Post('annual')
  createBudget(@Body() dto: CreateAnnualBudgetDto) {
    return this.budgetService.createBudget(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('annual')
  getAllBudgets() {
    return this.budgetService.getAllBudgets();
  }

  @UseGuards(JwtAuthGuard)
  @Get('annual/:id')
  getBudgetById(@Param('id') id: string) {
    return this.budgetService.getBudgetById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Patch('annual/:id')
  updateBudget(@Param('id') id: string, @Body() dto: UpdateAnnualBudgetDto) {
    return this.budgetService.updateBudget(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Delete('annual/:id')
  deleteBudget(@Param('id') id: string) {
    return this.budgetService.deleteBudget(id);
  }

  // --- Budget Allocations ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Post('allocation')
  createAllocation(@Body() dto: CreateBudgetAllocationDto) {
    return this.budgetService.createAllocation(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('annual/:budgetId/allocations')
  getAllocationsByBudget(@Param('budgetId') budgetId: string) {
    return this.budgetService.getAllocationsByBudget(budgetId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('allocation/:id')
  getAllocationById(@Param('id') id: string) {
    return this.budgetService.getAllocationById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Patch('allocation/:id')
  updateAllocation(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetAllocationDto,
  ) {
    return this.budgetService.updateAllocation(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Delete('allocation/:id')
  deleteAllocation(@Param('id') id: string) {
    return this.budgetService.deleteAllocation(id);
  }
}