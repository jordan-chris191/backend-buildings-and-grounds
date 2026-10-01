import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';

import { PositionsService } from './positions.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.positionsService.findAll(search, isActive);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRATOR')
  create(@Body() dto: CreatePositionDto, @Req() req) {
    return this.positionsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRATOR')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto, @Req() req,
  ) {
    return this.positionsService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRATOR')
  remove(@Param('id') id: string, @Req() req) {
    return this.positionsService.remove(id, req.user.userId);
  }

  @Patch(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRATOR')
  reactivate(@Param('id') id: string, @Req() req) { return this.positionsService.reactivate(id, req.user.userId); }
}
