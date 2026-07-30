// src/issuances/issuances.controller.ts
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
import { IssuancesService } from './issuances.service';
import { CreateIssuanceDto } from './dto/create-issuance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('issuances')
export class IssuancesController {
  constructor(private issuancesService: IssuancesService) {}

  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Post()
  create(@Req() req, @Body() dto: CreateIssuanceDto) {
    return this.issuancesService.create(req.user.userId, dto);
  }

  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.issuancesService.findAll(activeOnly === 'true');
  }

  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.issuancesService.findOne(id);
  }

  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/return')
  markReturned(@Param('id') id: string, @Req() req) {
    return this.issuancesService.markReturned(id, req.user.userId);
  }
}