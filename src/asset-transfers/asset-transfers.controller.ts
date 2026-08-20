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
import { CreateAssetTransferBatchDto } from './dto/create-asset-transfer-batch.dto';
import { ApproveAssetTransferBatchDto } from './dto/approve-asset-transfer-batch.dto';
import { RejectAssetTransferBatchDto } from './dto/reject-asset-transfer-batch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TransferStatus } from '@prisma/client';

@Controller('asset-transfers')
export class AssetTransfersController {
  constructor(private readonly assetTransfersService: AssetTransfersService) {}

  // -------------------------------------------------------------------
  // CREATE BATCH
  // -------------------------------------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post('batch')
  createBatch(@Req() req, @Body() dto: CreateAssetTransferBatchDto) {
    return this.assetTransfersService.createBatch(req.user.userId, dto);
  }

  // -------------------------------------------------------------------
  // GET ALL BATCHES (GROUPED)
  // -------------------------------------------------------------------
  @UseGuards(JwtAuthGuard)
  @Get('batches')
  findBatches(@Query('status') status?: TransferStatus) {
    return this.assetTransfersService.findBatches(status);
  }

  // -------------------------------------------------------------------
  // APPROVE BATCH
  // -------------------------------------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch('batch/:batchId/approve')
  approveBatch(
    @Param('batchId') batchId: string,
    @Req() req,
    @Body() dto: ApproveAssetTransferBatchDto,
  ) {
    return this.assetTransfersService.approveBatch(
      batchId,
      req.user.userId,
      dto,
    );
  }

  // -------------------------------------------------------------------
  // REJECT BATCH
  // -------------------------------------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch('batch/:batchId/reject')
  rejectBatch(
    @Param('batchId') batchId: string,
    @Req() req,
    @Body() dto: RejectAssetTransferBatchDto,
  ) {
    return this.assetTransfersService.rejectBatch(
      batchId,
      req.user.userId,
      dto,
    );
  }

  // -------------------------------------------------------------------
  // RECEIVE BATCH
  // -------------------------------------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
  @Patch('batch/:batchId/receive')
  receiveBatch(@Param('batchId') batchId: string, @Req() req) {
    return this.assetTransfersService.receiveBatch(batchId, req.user.userId);
  }
}