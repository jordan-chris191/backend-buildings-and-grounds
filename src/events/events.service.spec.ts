import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Campus, EventType } from '@prisma/client';
import { EventsService } from './events.service';

const creator = { id: 'creator-1', firstName: 'Ada', lastName: 'Lovelace' };
const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  title: 'Weekly B&G Meeting',
  type: EventType.MEETING,
  description: 'Coordination',
  location: 'Conference room',
  campus: Campus.MC1,
  startsAt: new Date('2026-10-03T01:00:00.000Z'),
  endsAt: new Date('2026-10-03T02:00:00.000Z'),
  allDay: false,
  isActive: true,
  archivedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  createdBy: creator,
  ...overrides,
});

describe('EventsService', () => {
  let prisma: any;
  let audit: any;
  let service: EventsService;

  beforeEach(() => {
    prisma = {
      event: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (work: any) => {
        if (Array.isArray(work)) return Promise.all(work);
        return work(prisma);
      }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new EventsService(prisma, audit);
  });

  it('creates valid timed and all-day events with an audit record', async () => {
    prisma.event.create
      .mockResolvedValueOnce(event())
      .mockResolvedValueOnce(event({ allDay: true, endsAt: null }));

    const timed = await service.create('creator-1', {
      title: ' Weekly B&G Meeting ',
      type: EventType.MEETING,
      startsAt: '2026-10-03T09:00:00+08:00',
      endsAt: '2026-10-03T10:30:00+08:00',
    });
    const allDay = await service.create('creator-1', {
      title: 'Inspection Day',
      type: EventType.INSPECTION,
      startsAt: '2026-10-05',
      allDay: true,
    });

    expect(timed.title).toBe('Weekly B&G Meeting');
    expect(allDay.allDay).toBe(true);
    expect(prisma.event.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Weekly B&G Meeting',
          allDay: false,
        }),
      }),
    );
    expect(prisma.event.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ allDay: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EVENT_CREATED',
        entityType: 'Event',
        performedById: 'creator-1',
      }),
      prisma,
    );
  });

  it('rejects end-before-start instead of silently changing event times', async () => {
    await expect(
      service.create('creator-1', {
        title: 'Invalid',
        type: EventType.OTHER,
        startsAt: '2026-10-03T10:00:00Z',
        endsAt: '2026-10-03T09:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it.each([
    ['inside', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z', true],
    ['begins before', '2026-10-01T01:00:00Z', '2026-10-10T02:00:00Z', true],
    ['ends after', '2026-10-20T01:00:00Z', '2026-11-03T02:00:00Z', true],
    ['spans whole range', '2026-09-01T01:00:00Z', '2026-11-03T02:00:00Z', true],
    ['outside', '2026-11-04T01:00:00Z', '2026-11-04T02:00:00Z', false],
    ['single point', '2026-10-15T01:00:00Z', null, true],
  ])(
    'uses overlap filtering for %s events',
    async (_name, startsAt, endsAt, included) => {
      prisma.event.findMany.mockResolvedValue(
        included
          ? [
              event({
                startsAt: new Date(startsAt),
                endsAt: endsAt ? new Date(endsAt) : null,
              }),
            ]
          : [],
      );
      prisma.event.count.mockResolvedValue(included ? 1 : 0);
      const result = await service.findAll({
        from: '2026-10-01',
        to: '2026-10-31',
      });

      expect(result.data).toHaveLength(included ? 1 : 0);
      const where = prisma.event.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            startsAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
          expect.objectContaining({ OR: expect.any(Array) }),
        ]),
      );
    },
  );

  it('hides inactive events by default and supports an explicit inactive query', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    prisma.event.count.mockResolvedValue(0);
    await service.findAll({});
    expect(prisma.event.findMany.mock.calls[0][0].where.isActive).toBe(true);

    await service.findAll({ includeInactive: true });
    expect(
      prisma.event.findMany.mock.calls[1][0].where.isActive,
    ).toBeUndefined();
  });

  it('updates atomically with before/after audit values and rejects an invalid date update', async () => {
    prisma.event.findFirst.mockResolvedValue(event());
    prisma.event.update.mockResolvedValue(
      event({
        title: 'Moved meeting',
        startsAt: new Date('2026-10-04T01:00:00Z'),
      }),
    );
    const updated = await service.update('event-1', 'creator-1', {
      title: 'Moved meeting',
      startsAt: '2026-10-04T01:00:00Z',
      endsAt: '2026-10-04T02:00:00Z',
    });
    expect(updated.title).toBe('Moved meeting');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EVENT_UPDATED',
        metadata: expect.objectContaining({
          previous: expect.any(Object),
          next: expect.any(Object),
        }),
      }),
      prisma,
    );

    await expect(
      service.update('event-1', 'creator-1', {
        startsAt: '2026-10-04T03:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('archives events, excludes them from normal reads, and audits the mutation', async () => {
    prisma.event.findFirst.mockResolvedValue(event());
    prisma.event.update.mockResolvedValue(
      event({ isActive: false, archivedAt: new Date() }),
    );
    const archived = await service.archive('event-1', 'creator-1');
    expect(archived.isActive).toBe(false);
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          archivedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EVENT_ARCHIVED' }),
      prisma,
    );
  });

  it('returns 404 for an event that does not exist or is inactive in a normal detail read', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing', isActive: true } }),
    );
  });
});
