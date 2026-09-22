// src/work-requests/work-requests.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { UpdateWorkRequestDto } from './dto/update-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';
import { ApproveWorkRequestDto } from './dto/approve-work-request.dto';
import { RejectWorkRequestDto } from './dto/reject-work-request.dto';
import { CreateWalkInWorkRequestDto } from './dto/create-walk-in-work-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestStatus, Campus } from '@prisma/client';
import { QueryWorkRequestsDto } from './dto/query-work-requests.dto';

@Controller('work-requests')
export class WorkRequestsController {
  constructor(private readonly workRequestsService: WorkRequestsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER', 'PROPERTY_CUSTODIAN', 'FACULTY')
  @Post()
  create(@Req() req, @Body() dto: CreateWorkRequestDto) {
    return this.workRequestsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Post('walk-in')
  createWalkIn(@Req() req, @Body() dto: CreateWalkInWorkRequestDto) {
    return this.workRequestsService.createWalkIn(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Req() req,
    @Query() query: QueryWorkRequestsDto,
  ) {
    const assignedToUserId = query.assignedToMe === 'true' ? req.user.userId : undefined;
    const includeInactiveFlag = query.includeInactive === 'true';
    return this.workRequestsService.findAllForUser(
      req.user.userId,
      query.status,
      query.campus,
      assignedToUserId,
      includeInactiveFlag,
      query.page,
      query.limit,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.workRequestsService.findOneForUser(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateWorkRequestDto,
  ) {
    return this.workRequestsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: ApproveWorkRequestDto,
  ) {
    return this.workRequestsService.approve(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: RejectWorkRequestDto,
  ) {
    return this.workRequestsService.reject(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.workRequestsService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: AssignWorkRequestDto,
  ) {
    return this.workRequestsService.assign(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/unassign/:assignmentId')
  unassign(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Req() req,
  ) {
    return this.workRequestsService.unassign(id, assignmentId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER', 'PROPERTY_CUSTODIAN', 'CAMPUS_STAFF')
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { progressPercent: number; note?: string },
  ) {
    return this.workRequestsService.updateProgress(
      id,
      body.progressPercent,
      req.user.userId,
      body.note,
      req.user.role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER', 'PROPERTY_CUSTODIAN', 'CAMPUS_STAFF')
  @Patch(':id/complete')
  complete(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: CompleteWorkRequestDto,
  ) {
    return this.workRequestsService.complete(id, req.user.userId, dto, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() req) {
    return this.workRequestsService.cancel(id, req.user.userId);
  }
}
