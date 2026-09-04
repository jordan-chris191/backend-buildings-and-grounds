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
import { MaintenanceUnitTypeConfigsService } from './maintenance-unit-type-configs.service';
import { CreateMaintenanceUnitTypeConfigDto } from './dto/create-maintenance-unit-type-config.dto';
import { UpdateMaintenanceUnitTypeConfigDto } from './dto/update-maintenance-unit-type-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('maintenance-unit-type-configs')
export class MaintenanceUnitTypeConfigsController {
  constructor(
    private readonly maintenanceUnitTypeConfigsService: MaintenanceUnitTypeConfigsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreateMaintenanceUnitTypeConfigDto) {
    return this.maintenanceUnitTypeConfigsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.maintenanceUnitTypeConfigsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceUnitTypeConfigsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateMaintenanceUnitTypeConfigDto,
  ) {
    return this.maintenanceUnitTypeConfigsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req) {
    return this.maintenanceUnitTypeConfigsService.deactivate(id, req.user.userId);
  }
}