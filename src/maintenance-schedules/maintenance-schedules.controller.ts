import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RecordRunHoursDto } from './dto/record-run-hours.dto';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(
    private readonly maintenanceSchedulesService: MaintenanceSchedulesService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.maintenanceSchedulesService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceSchedulesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/complete')
  complete(@Param('id') id: string, @Req() req) {
    return this.maintenanceSchedulesService.complete(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req) {   // ✅ added @Req()
    return this.maintenanceSchedulesService.deactivate(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrator', 'Building & Grounds Officer')
@Patch(':id/run-hours')
recordRunHours(
  @Param('id') id: string,
  @Req() req,
  @Body() dto: RecordRunHoursDto,
) {
  return this.maintenanceSchedulesService.recordRunHours(id, req.user.userId, dto);
}
}