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
import { MaintainableAssetProfilesService } from './maintainable-asset-profiles.service';
import { CreateMaintainableAssetProfileDto } from './dto/create-maintainable-asset-profile.dto';
import { UpdateMaintainableAssetProfileDto } from './dto/update-maintainable-asset-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('maintainable-asset-profiles')
export class MaintainableAssetProfilesController {
  constructor(
    private readonly maintainableAssetProfilesService: MaintainableAssetProfilesService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Req() req, @Body() dto: CreateMaintainableAssetProfileDto) {
    return this.maintainableAssetProfilesService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('assetType') assetType?: string) {
    return this.maintainableAssetProfilesService.findAll(assetType);
  }

  // must come before ':id' so 'by-item' isn't swallowed as an :id value
  @UseGuards(JwtAuthGuard)
  @Get('by-item/:inventoryItemId')
  findByInventoryItem(@Param('inventoryItemId') inventoryItemId: string) {
    return this.maintainableAssetProfilesService.findByInventoryItem(inventoryItemId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintainableAssetProfilesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateMaintainableAssetProfileDto,
  ) {
    return this.maintainableAssetProfilesService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req) {
    return this.maintainableAssetProfilesService.deactivate(id, req.user.userId);
  }
}   