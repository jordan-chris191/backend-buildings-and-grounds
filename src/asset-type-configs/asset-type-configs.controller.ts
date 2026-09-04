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
import { AssetTypeConfigsService } from './asset-type-configs.service';
import { CreateAssetTypeConfigDto } from './dto/create-asset-type-config.dto';
import { UpdateAssetTypeConfigDto } from './dto/update-asset-type-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('asset-type-configs')
export class AssetTypeConfigsController {
  constructor(private readonly assetTypeConfigsService: AssetTypeConfigsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Post()
  create(@Req() req, @Body() dto: CreateAssetTypeConfigDto) {
    return this.assetTypeConfigsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.assetTypeConfigsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assetTypeConfigsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Patch(':id')
  update(@Param('id') id: string, @Req() req, @Body() dto: UpdateAssetTypeConfigDto) {
    return this.assetTypeConfigsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req) {
    return this.assetTypeConfigsService.deactivate(id, req.user.userId);
  }
}