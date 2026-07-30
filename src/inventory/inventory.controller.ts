// src/inventory/inventory.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ItemType } from '@prisma/client';
import { AdjustQuantityDto } from './dto/adjust-quantity.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('type') type?: ItemType,
    @Query('projectId') projectId?: string,
  ) {
    return this.inventoryService.findAll(type, projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/stock-history')
  getStockHistory(@Param('id') id: string) {
    return this.inventoryService.getStockHistory(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.inventoryService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/adjust')
  adjust(@Param('id') id: string, @Req() req, @Body() dto: AdjustQuantityDto) {
    return this.inventoryService.adjustQuantity(id, req.user.userId, dto.newQuantity, dto.reason);
  }
}