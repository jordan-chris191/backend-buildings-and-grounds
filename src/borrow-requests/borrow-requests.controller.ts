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
import { BorrowRequestsService } from './borrow-requests.service';
import { CreateBorrowRequestDto } from './dto/create-borrow-request.dto';
import { ProcessBorrowRequestDto } from './dto/process-borrow-request.dto';
import { UpdateBorrowRequestDto } from './dto/update-borrow-request.dto'; // new import
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BorrowRequestStatus } from '@prisma/client';

@Controller('borrow-requests')
export class BorrowRequestsController {
  constructor(private readonly borrowRequestsService: BorrowRequestsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req, @Body() dto: CreateBorrowRequestDto) {
    return this.borrowRequestsService.create(req.user.userId, dto);
  }

 @UseGuards(JwtAuthGuard)
@Get()
async findAll(
  @Req() req,
  @Query('status') status?: BorrowRequestStatus,
) {
  const user = req.user;
  const isAdmin = ['Administrator', 'Building & Grounds Officer', 'Property Custodian'].includes(user.role);
  
  if (isAdmin) {
    // Admin sees all
    return this.borrowRequestsService.findAll(status);
  } else {
    // Regular users see only their own
    return this.borrowRequestsService.findMine(user.userId, status);
  }
}

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.borrowRequestsService.findOne(id);
  }

  // Fixed: pass the whole DTO object
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: ProcessBorrowRequestDto,
  ) {
    return this.borrowRequestsService.approve(id, req.user.userId, dto);
  }

  // Fixed: pass the whole DTO object
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: ProcessBorrowRequestDto,
  ) {
    return this.borrowRequestsService.reject(id, req.user.userId, dto);
  }

  // New: partial update before RETURNED
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateBorrowRequestDto,
  ) {
    return this.borrowRequestsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/return')
  returnItem(@Param('id') id: string, @Req() req) {
    return this.borrowRequestsService.markReturned(id, req.user.userId, req.user.role);
  }
}
