import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
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
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('Administrator')
  create(@Body() dto: CreatePositionDto) {
    return this.positionsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.positionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('Administrator')
  remove(@Param('id') id: string) {
    return this.positionsService.remove(id);
  }
}