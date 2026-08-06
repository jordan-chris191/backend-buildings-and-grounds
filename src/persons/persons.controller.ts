import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PersonsService } from './persons.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PersonType } from '@prisma/client';

@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.personsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('type') type?: PersonType,
    @Query('search') search?: string,
  ) {
    return this.personsService.findAll(type, search);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.personsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator', 'Building & Grounds Officer')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.personsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Administrator')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.personsService.remove(id);
  }
}