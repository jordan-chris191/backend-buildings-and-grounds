import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RecordRunHoursDto } from './dto/record-run-hours.dto';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dto/update-maintenance-schedule.dto';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(
    private readonly maintenanceSchedulesService: MaintenanceSchedulesService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Post()
  create(@Req() req, @Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req, @Query('includeInactive') includeInactive?: string) {
    if (includeInactive === 'true' && !['ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER'].includes(req.user.role)) {
      throw new ForbiddenException('Inactive maintenance schedule history requires an operational role.');
    }
    return this.maintenanceSchedulesService.findAll(includeInactive === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceSchedulesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id')
  update(@Param('id') id: string, @Req() req, @Body() dto: UpdateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/complete')
  complete(@Param('id') id: string, @Req() req) {
    return this.maintenanceSchedulesService.complete(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req) {   // ✅ added @Req()
    return this.maintenanceSchedulesService.deactivate(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @Req() req) {
    return this.maintenanceSchedulesService.reactivate(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
@Patch(':id/run-hours')
recordRunHours(
  @Param('id') id: string,
  @Req() req,
  @Body() dto: RecordRunHoursDto,
) {
  return this.maintenanceSchedulesService.recordRunHours(id, req.user.userId, dto);
}
}
