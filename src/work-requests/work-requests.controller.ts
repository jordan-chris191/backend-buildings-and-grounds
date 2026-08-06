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
  ParseEnumPipe,
} from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { UpdateWorkRequestDto } from './dto/update-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestStatus, Campus } from '@prisma/client';

@Controller('work-requests')
export class WorkRequestsController {
  constructor(private readonly workRequestsService: WorkRequestsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian', 'Office')
  @Post()
  create(@Req() req, @Body() dto: CreateWorkRequestDto) {
    return this.workRequestsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('status') status?: RequestStatus,
    // ✅ FIXED: ParseEnumPipe ensures valid Campus and transforms to enum
    @Query('campus', new ParseEnumPipe(Campus, { optional: true })) campus?: Campus,
  ) {
    return this.workRequestsService.findAll(status, campus);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateWorkRequestDto,
  ) {
    return this.workRequestsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: AssignWorkRequestDto,
  ) {
    return this.workRequestsService.assign(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/unassign/:assignmentId')
  unassign(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Req() req,
  ) {
    return this.workRequestsService.unassign(id, assignmentId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Req() req,
    @Body('progressPercent') progressPercent: number,
  ) {
    return this.workRequestsService.updateProgress(id, progressPercent, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/complete')
  complete(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: CompleteWorkRequestDto,
  ) {
    return this.workRequestsService.complete(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() req) {
    return this.workRequestsService.cancel(id, req.user.userId);
  }
}