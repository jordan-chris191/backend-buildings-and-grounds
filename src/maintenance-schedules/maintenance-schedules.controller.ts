// src/maintenance-schedules/maintenance-schedules.controller.ts
import { Body, Controller, Get, Post, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrator', 'Building & Grounds Officer')
@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(private maintenanceSchedulesService: MaintenanceSchedulesService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.create(req.user.userId, dto);
  }

  @Get()
  findAll() {
    return this.maintenanceSchedulesService.findAll();
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.maintenanceSchedulesService.deactivate(id);
  }
}