import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Campus, EventType, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

type EventRecord = {
  id: string;
  title: string;
  type: EventType;
  description: string | null;
  location: string | null;
  campus: Campus | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; firstName: string; lastName: string };
};

@Injectable()
export class EventsService {
  private readonly eventInclude = {
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private toResponse(event: EventRecord) {
    const { createdBy, ...rest } = event;
    return {
      ...rest,
      createdBy: {
        id: createdBy.id,
        name: `${createdBy.firstName} ${createdBy.lastName}`.trim(),
      },
    };
  }

  /** Date-only calendar filters are inclusive Philippine calendar days (+08:00). */
  private parseRangeBoundary(value: string, endOfDay: boolean): Date {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`)
      : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        'Date filters must be valid ISO date/time values.',
      );
    }
    return date;
  }

  private parseEventDate(value: string, field: 'startsAt' | 'endsAt'): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `${field} must be a valid ISO date/time value.`,
      );
    }
    return date;
  }

  private validateEventTimes(startsAt: Date, endsAt: Date | null) {
    if (endsAt && endsAt.getTime() < startsAt.getTime()) {
      throw new BadRequestException(
        'endsAt must be greater than or equal to startsAt.',
      );
    }
  }

  private normalizeTitle(title: string): string {
    const normalized = title.trim();
    if (!normalized) {
      throw new BadRequestException('title is required.');
    }
    return normalized;
  }

  private snapshot(event: EventRecord) {
    return {
      title: event.title,
      type: event.type,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      campus: event.campus,
      allDay: event.allDay,
    };
  }

  async create(actorId: string, dto: CreateEventDto) {
    const startsAt = this.parseEventDate(dto.startsAt, 'startsAt');
    const endsAt = dto.endsAt
      ? this.parseEventDate(dto.endsAt, 'endsAt')
      : null;
    this.validateEventTimes(startsAt, endsAt);

    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: this.normalizeTitle(dto.title),
          type: dto.type,
          description: dto.description,
          location: dto.location,
          campus: dto.campus,
          startsAt,
          endsAt,
          allDay: dto.allDay ?? false,
          createdById: actorId,
        },
        include: this.eventInclude,
      });
      await this.audit.log(
        {
          action: 'EVENT_CREATED',
          entityType: 'Event',
          entityId: event.id,
          description: `Created office event "${event.title}" (${event.type}).`,
          metadata: { event: this.snapshot(event) },
          performedById: actorId,
        },
        tx,
      );
      return event;
    });
    return this.toResponse(created);
  }

  async findAll(query: ListEventsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const from = query.from
      ? this.parseRangeBoundary(query.from, false)
      : undefined;
    const to = query.to ? this.parseRangeBoundary(query.to, true) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must be on or before to.');
    }

    const where: Prisma.EventWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.type ? { type: query.type } : {}),
      ...(query.campus ? { campus: query.campus } : {}),
    };

    if (from && to) {
      where.AND = [
        { startsAt: { lte: to } },
        {
          OR: [
            { endsAt: { gte: from } },
            { endsAt: null, startsAt: { gte: from } },
          ],
        },
      ];
    } else if (from) {
      where.OR = [
        { endsAt: { gte: from } },
        { endsAt: null, startsAt: { gte: from } },
      ];
    } else if (to) {
      where.startsAt = { lte: to };
    }

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: this.eventInclude,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      data: events.map((event) => this.toResponse(event)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, includeInactive = false) {
    const event = await this.prisma.event.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true }) },
      include: this.eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found.');
    return this.toResponse(event);
  }

  async update(id: string, actorId: string, dto: UpdateEventDto) {
    const before = (await this.findOne(id, true)) as ReturnType<
      typeof this.toResponse
    >;
    const startsAt = dto.startsAt
      ? this.parseEventDate(dto.startsAt, 'startsAt')
      : before.startsAt;
    const endsAt =
      dto.endsAt === undefined
        ? before.endsAt
        : dto.endsAt === null
          ? null
          : this.parseEventDate(dto.endsAt, 'endsAt');
    this.validateEventTimes(startsAt, endsAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.update({
        where: { id },
        data: {
          ...(dto.title !== undefined
            ? { title: this.normalizeTitle(dto.title) }
            : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.campus !== undefined ? { campus: dto.campus } : {}),
          ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
          startsAt,
          endsAt,
        },
        include: this.eventInclude,
      });
      await this.audit.log(
        {
          action: 'EVENT_UPDATED',
          entityType: 'Event',
          entityId: id,
          description: `Updated office event "${event.title}".`,
          metadata: {
            previous: this.snapshot(before as unknown as EventRecord),
            next: this.snapshot(event),
          },
          performedById: actorId,
        },
        tx,
      );
      return event;
    });
    return this.toResponse(updated);
  }

  async archive(id: string, actorId: string) {
    const existing = await this.findOne(id, true);
    if (!existing.isActive)
      throw new BadRequestException('Event is already archived.');
    const archived = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
        include: this.eventInclude,
      });
      await this.audit.log(
        {
          action: 'EVENT_ARCHIVED',
          entityType: 'Event',
          entityId: id,
          description: `Archived office event "${event.title}".`,
          metadata: {
            previous: { isActive: true },
            next: { isActive: false, archivedAt: event.archivedAt },
          },
          performedById: actorId,
        },
        tx,
      );
      return event;
    });
    return this.toResponse(archived);
  }

  async reactivate(id: string, actorId: string) {
    const existing = await this.findOne(id, true);
    if (existing.isActive)
      throw new BadRequestException('Event is already active.');
    const reactivated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.update({
        where: { id },
        data: { isActive: true, archivedAt: null },
        include: this.eventInclude,
      });
      await this.audit.log(
        {
          action: 'EVENT_REACTIVATED',
          entityType: 'Event',
          entityId: id,
          description: `Reactivated office event "${event.title}".`,
          metadata: {
            previous: { isActive: false },
            next: { isActive: true, archivedAt: null },
          },
          performedById: actorId,
        },
        tx,
      );
      return event;
    });
    return this.toResponse(reactivated);
  }
}
