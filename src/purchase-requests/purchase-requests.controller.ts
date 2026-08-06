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
import { PurchaseRequestsService } from './purchase-requests.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PurchaseRequestStatus } from '@prisma/client';

@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreatePurchaseRequestDto) {
    return this.purchaseRequestsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('status') status?: PurchaseRequestStatus) {
    return this.purchaseRequestsService.findAll(status);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdatePurchaseRequestDto,
  ) {
    return this.purchaseRequestsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/submit')
  submit(@Param('id') id: string, @Req() req) {
    return this.purchaseRequestsService.submit(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/approve')
  approve(@Param('id') id: string, @Req() req) {
    return this.purchaseRequestsService.approve(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Req() req) {
    return this.purchaseRequestsService.reject(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/complete')
  complete(@Param('id') id: string, @Req() req) {
    return this.purchaseRequestsService.complete(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() req) {
    return this.purchaseRequestsService.cancel(id, req.user.userId);
  }
}