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
import { AssetTransfersService } from './asset-transfers.service';
import { CreateAssetTransferDto } from './dto/create-asset-transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TransferStatus } from '@prisma/client';

@Controller('asset-transfers')
export class AssetTransfersController {
  constructor(private readonly assetTransfersService: AssetTransfersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreateAssetTransferDto) {
    return this.assetTransfersService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('status') status?: TransferStatus) {
    return this.assetTransfersService.findAll(status);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assetTransfersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/approve')
  approve(@Param('id') id: string, @Req() req) {
    return this.assetTransfersService.approve(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Req() req) {
    return this.assetTransfersService.reject(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch(':id/receive')
  receive(@Param('id') id: string, @Req() req) {
    return this.assetTransfersService.receive(id, req.user.userId);
  }
}