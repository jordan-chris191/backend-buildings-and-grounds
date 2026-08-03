// src/positions/positions.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionsController {
  constructor(private positionsService: PositionsService) {}

  @Get()
  findAll() {
    return this.positionsService.findAll();
  }
}