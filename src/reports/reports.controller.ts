import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory-summary')
  inventorySummary() {
    return this.reportsService.inventorySummary();
  }

  @Get('work-requests-by-status')
  workRequestsByStatus() {
    return this.reportsService.workRequestsByStatus();
  }
}