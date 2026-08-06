import {
  Controller,
  Post,
  Get,
  Patch,        // ← add this
  Delete,       // ← add this
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateMaterialEstimateDto } from './dto/create-material-estimate.dto';
import { UpdateMaterialEstimateDto } from './dto/update-material-estimate.dto'; // ← add this
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrator', 'Building & Grounds Officer')
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post('estimates')
  createEstimate(@Body() dto: CreateMaterialEstimateDto) {
    return this.projectsService.createEstimate(dto);
  }

  @Get(':id/estimates')
  getEstimates(@Param('id') id: string) {
    return this.projectsService.getEstimates(id);
  }

  @Patch('estimates/:id')
  updateEstimate(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialEstimateDto,
  ) {
    return this.projectsService.updateEstimate(id, dto);
  }

  @Delete('estimates/:id')
  removeEstimate(@Param('id') id: string) {
    return this.projectsService.removeEstimate(id);
  }
}