// src/work-requests/work-requests.controller.ts
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
import { WorkRequestsService } from './work-requests.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('work-requests')
export class WorkRequestsController {
  constructor(private workRequestsService: WorkRequestsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Faculty', 'Campus Staff')
  @Post()
  create(@Req() req, @Body() dto: CreateWorkRequestDto) {
    return this.workRequestsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Get()
  findAll() {
    return this.workRequestsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMine(@Req() req) {
    return this.workRequestsService.findMine(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignWorkRequestDto) {
    return this.workRequestsService.assign(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/accept')
  accept(@Param('id') id: string, @Req() req) {
    return this.workRequestsService.accept(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/complete')
  complete(@Param('id') id: string, @Req() req, @Body() dto: CompleteWorkRequestDto) {
    return this.workRequestsService.complete(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Req() req,
    @Body('progressPercent') progressPercent: number,
  ) {
    return this.workRequestsService.updateProgress(id, req.user.userId, progressPercent);
  }
}