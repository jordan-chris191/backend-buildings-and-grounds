import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Campus } from '@prisma/client';

@Controller('offices')
export class OfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Post()
  create(@Body() dto: CreateOfficeDto, @Req() req) {
    return this.officesService.create(dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('campus') campus?: Campus, @Query('search') search?: string, @Query('isActive') isActive?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.officesService.findAll({ campus, search, isActive, page, limit });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.officesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOfficeDto, @Req() req) {
    return this.officesService.update(id, dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.officesService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @Req() req) { return this.officesService.reactivate(id, req.user.userId); }
}
