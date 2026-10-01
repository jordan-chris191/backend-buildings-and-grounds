import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

const EVENT_READ_ROLES = [
  ROLE_CODES.ADMINISTRATOR,
  ROLE_CODES.BUILDING_GROUNDS_OFFICER,
  ROLE_CODES.CAMPUS_STAFF,
  ROLE_CODES.PROPERTY_CUSTODIAN,
  ROLE_CODES.FACULTY,
];
const EVENT_WRITE_ROLES = [
  ROLE_CODES.ADMINISTRATOR,
  ROLE_CODES.BUILDING_GROUNDS_OFFICER,
];

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @Roles(...EVENT_WRITE_ROLES)
  create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateEventDto,
  ) {
    return this.events.create(req.user.userId, dto);
  }

  @Get()
  @Roles(...EVENT_READ_ROLES)
  findAll(
    @Req() req: { user: { role: string } },
    @Query() query: ListEventsQueryDto,
  ) {
    if (
      query.includeInactive &&
      !EVENT_WRITE_ROLES.includes(
        req.user.role as (typeof EVENT_WRITE_ROLES)[number],
      )
    ) {
      throw new ForbiddenException(
        'Inactive event history requires an operational role.',
      );
    }
    return this.events.findAll(query);
  }

  @Get(':id')
  @Roles(...EVENT_READ_ROLES)
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  @Patch(':id')
  @Roles(...EVENT_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(id, req.user.userId, dto);
  }

  @Patch(':id/archive')
  @Roles(...EVENT_WRITE_ROLES)
  archive(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.events.archive(id, req.user.userId);
  }

  @Patch(':id/reactivate')
  @Roles(...EVENT_WRITE_ROLES)
  reactivate(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.events.reactivate(id, req.user.userId);
  }
}
