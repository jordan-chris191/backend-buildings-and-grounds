import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MaintenanceBasis, Prisma } from '@prisma/client';

const mockPrismaService = {
  inventoryItem: {
    findUnique: jest.fn(),
  },
  maintenanceSchedule: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  office: {
    upsert: jest.fn(),
  },
  workRequest: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  sequenceCounter: {
    upsert: jest.fn(),
  },
  assetTypeConfig: {
    findUnique: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  workRequestAssignment: {
    createMany: jest.fn(),
  },
  runHourReading: {
    create: jest.fn(),
  },
};

const mockAuditLogService = {
  log: jest.fn(),
};

describe('MaintenanceSchedulesService', () => {
  let service: MaintenanceSchedulesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceSchedulesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<MaintenanceSchedulesService>(
      MaintenanceSchedulesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const userId = 'user-123';
    const inventoryItemId = 'item-123';

    const mockProfile = {
      id: 'profile-1',
      assetType: 'generator',
      defaultCooldownDays: 30,
      unitTypeConfig: { id: 'utc-1', name: 'Engine', defaultCooldownDays: 30 },
    };

    const mockInventoryItem = {
      id: inventoryItemId,
      name: 'Backup Generator A',
      campus: 'Main Campus',
      maintainableAssetProfile: mockProfile,
    };

    const mockSchedule = {
      id: 'schedule-1',
      title: 'Oil Change',
      basis: MaintenanceBasis.CALENDAR,
      frequencyDays: 30,
      nextDueAt: new Date('2024-12-01'),
      frequencyHours: null,
      nextDueAtHours: null,
      currentRunHours: new Prisma.Decimal(0),
      lastPerformedAt: null,
      notes: 'Test notes',
      isActive: true,
      inventoryItemId,
      createdById: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      inventoryItem: mockInventoryItem,
      createdBy: { id: userId, firstName: 'John', lastName: 'Doe' },
      workRequests: [],
    };

    beforeEach(() => {
      mockPrismaService.inventoryItem.findUnique.mockResolvedValue(
        mockInventoryItem,
      );
      mockPrismaService.maintenanceSchedule.create.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.findFirst.mockResolvedValue(null);
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.office.upsert.mockResolvedValue({ id: 'office-1' });
      mockPrismaService.sequenceCounter.upsert.mockResolvedValue({ count: 1 });
      mockPrismaService.workRequest.create.mockResolvedValue({ id: 'wr-1' });
      mockPrismaService.assetTypeConfig.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findMany.mockResolvedValue([]);
    });

    it('should create a CALENDAR-based maintenance schedule', async () => {
      const dto = {
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        inventoryItemId,
        frequencyDays: 30,
        nextDueAt: '2024-12-01T00:00:00Z',
      };

      const result = await service.create(userId, dto);

      expect(mockPrismaService.inventoryItem.findUnique).toHaveBeenCalledWith({
        where: { id: inventoryItemId },
        include: {
          maintainableAssetProfile: { include: { unitTypeConfig: true } },
        },
      });
      expect(mockPrismaService.maintenanceSchedule.create).toHaveBeenCalled();
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'MaintenanceSchedule',
        }),
      );
      expect(result).toEqual(mockSchedule);
    });

    it('should throw BadRequestException if inventory item not found', async () => {
      mockPrismaService.inventoryItem.findUnique.mockResolvedValue(null);

      const dto = {
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        inventoryItemId,
        frequencyDays: 30,
        nextDueAt: '2024-12-01T00:00:00Z',
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        'Inventory item not found.',
      );
    });

    it('should throw BadRequestException if item has no maintainable profile', async () => {
      mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
        ...mockInventoryItem,
        maintainableAssetProfile: null,
      });

      const dto = {
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        inventoryItemId,
        frequencyDays: 30,
        nextDueAt: '2024-12-01T00:00:00Z',
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        'no maintainable-asset profile',
      );
    });

    it('should throw BadRequestException if CALENDAR schedule missing frequencyDays and no profile default', async () => {
      // Override mock to have no default cooldown days
      mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
        ...mockInventoryItem,
        maintainableAssetProfile: {
          ...mockProfile,
          unitTypeConfig: {
            id: 'utc-1',
            name: 'Engine',
            defaultCooldownDays: null,
          },
        },
      });

      const dto = {
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        inventoryItemId,
        nextDueAt: '2024-12-01T00:00:00Z',
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        'frequencyDays is required',
      );
    });

    it('should throw BadRequestException if CALENDAR schedule missing nextDueAt', async () => {
      const dto = {
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        inventoryItemId,
        frequencyDays: 30,
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        'nextDueAt is required',
      );
    });

    it('should create a RUNTIME-based maintenance schedule', async () => {
      const runtimeSchedule = {
        ...mockSchedule,
        basis: MaintenanceBasis.RUNTIME,
        frequencyHours: new Prisma.Decimal(500),
        nextDueAtHours: new Prisma.Decimal(500),
      };

      mockPrismaService.maintenanceSchedule.create.mockResolvedValue(
        runtimeSchedule,
      );
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        runtimeSchedule,
      );

      const dto = {
        title: 'Filter Replacement',
        basis: MaintenanceBasis.RUNTIME,
        inventoryItemId,
        frequencyHours: 500,
      };

      const result = await service.create(userId, dto);

      expect(mockPrismaService.maintenanceSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            basis: MaintenanceBasis.RUNTIME,
            frequencyHours: expect.any(Prisma.Decimal),
          }),
        }),
      );
      expect(result.basis).toBe(MaintenanceBasis.RUNTIME);
    });

    it('should allow one active CALENDAR and one active RUNTIME schedule for an item', async () => {
      const runtimeSchedule = {
        ...mockSchedule,
        id: 'schedule-2',
        basis: MaintenanceBasis.RUNTIME,
        frequencyHours: new Prisma.Decimal(500),
        nextDueAtHours: new Prisma.Decimal(500),
      };
      mockPrismaService.maintenanceSchedule.create.mockResolvedValue(
        runtimeSchedule,
      );
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        runtimeSchedule,
      );

      await service.create(userId, {
        title: 'Runtime inspection',
        basis: MaintenanceBasis.RUNTIME,
        inventoryItemId,
        frequencyHours: 500,
      });

      expect(
        mockPrismaService.maintenanceSchedule.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          inventoryItemId,
          basis: MaintenanceBasis.RUNTIME,
          isActive: true,
        },
      });
      expect(mockPrismaService.maintenanceSchedule.create).toHaveBeenCalled();
    });

    it('should reject a duplicate active schedule with the same basis', async () => {
      mockPrismaService.maintenanceSchedule.findFirst.mockResolvedValue({
        id: 'existing-calendar-schedule',
      });

      await expect(
        service.create(userId, {
          title: 'Oil Change',
          basis: MaintenanceBasis.CALENDAR,
          inventoryItemId,
          frequencyDays: 30,
          nextDueAt: '2024-12-01T00:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
      expect(
        mockPrismaService.maintenanceSchedule.create,
      ).not.toHaveBeenCalled();
    });

    it('should translate a concurrent unique-constraint collision into ConflictException', async () => {
      mockPrismaService.maintenanceSchedule.create.mockRejectedValue({
        code: 'P2002',
        meta: {
          target: 'MaintenanceSchedule_active_inventoryItemId_basis_key',
        },
      });

      await expect(
        service.create(userId, {
          title: 'Oil Change',
          basis: MaintenanceBasis.CALENDAR,
          inventoryItemId,
          frequencyDays: 30,
          nextDueAt: '2024-12-01T00:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should translate the Prisma 6 field-target form of the active-schedule collision', async () => {
      mockPrismaService.maintenanceSchedule.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['inventoryItemId', 'basis'] },
      });

      await expect(
        service.create(userId, {
          title: 'Oil Change',
          basis: MaintenanceBasis.CALENDAR,
          inventoryItemId,
          frequencyDays: 30,
          nextDueAt: '2024-12-01T00:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should not misreport an unrelated unique-constraint collision as a duplicate schedule', async () => {
      const error = {
        code: 'P2002',
        meta: { target: 'SomeOther_unique_key' },
      };
      mockPrismaService.maintenanceSchedule.create.mockRejectedValue(error);

      await expect(
        service.create(userId, {
          title: 'Oil Change',
          basis: MaintenanceBasis.CALENDAR,
          inventoryItemId,
          frequencyDays: 30,
          nextDueAt: '2024-12-01T00:00:00Z',
        }),
      ).rejects.toBe(error);
    });

    it('should reject schedule creation when the maintainable profile is inactive', async () => {
      mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
        ...mockInventoryItem,
        maintainableAssetProfile: { ...mockProfile, isActive: false },
      });

      await expect(
        service.create(userId, {
          title: 'Oil Change',
          basis: MaintenanceBasis.CALENDAR,
          inventoryItemId,
          frequencyDays: 30,
          nextDueAt: '2024-12-01T00:00:00Z',
        }),
      ).rejects.toThrow('inactive maintainable-asset profile');
      expect(
        mockPrismaService.maintenanceSchedule.create,
      ).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if RUNTIME schedule missing frequencyHours', async () => {
      const dto = {
        title: 'Filter Replacement',
        basis: MaintenanceBasis.RUNTIME,
        inventoryItemId,
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        'frequencyHours is required',
      );
    });
  });

  describe('findAll', () => {
    it('should return all active maintenance schedules', async () => {
      const mockSchedules = [
        { id: 'schedule-1', title: 'Schedule 1', isActive: true },
        { id: 'schedule-2', title: 'Schedule 2', isActive: true },
      ];

      mockPrismaService.maintenanceSchedule.findMany.mockResolvedValue(
        mockSchedules,
      );

      const result = await service.findAll();

      expect(
        mockPrismaService.maintenanceSchedule.findMany,
      ).toHaveBeenCalledWith({
        where: { isActive: true },
        include: expect.any(Object),
        orderBy: { nextDueAt: 'asc' },
      });
      expect(result).toEqual(mockSchedules);
    });
  });

  describe('findOne', () => {
    it('should return a maintenance schedule by id', async () => {
      const mockSchedule = { id: 'schedule-1', title: 'Test Schedule' };
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );

      const result = await service.findOne('schedule-1');

      expect(result).toEqual(mockSchedule);
    });

    it('should throw NotFoundException if schedule not found', async () => {
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        'Maintenance schedule not found.',
      );
    });
  });

  describe('complete', () => {
    const userId = 'user-123';

    it('should complete a CALENDAR schedule and calculate next due date', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Oil Change',
        basis: MaintenanceBasis.CALENDAR,
        frequencyDays: 30,
        nextDueAt: new Date('2024-12-01'),
        lastPerformedAt: null,
      };

      const updatedSchedule = {
        ...mockSchedule,
        lastPerformedAt: expect.any(Date),
        nextDueAt: expect.any(Date),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue(
        updatedSchedule,
      );

      const result = await service.complete('schedule-1', userId);

      expect(mockPrismaService.maintenanceSchedule.update).toHaveBeenCalledWith(
        {
          where: { id: 'schedule-1' },
          data: expect.objectContaining({
            lastPerformedAt: expect.any(Date),
            nextDueAt: expect.any(Date),
          }),
          include: expect.any(Object),
        },
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMPLETE' }),
      );
    });

    it('should throw BadRequestException if CALENDAR schedule has no frequencyDays', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Test',
        basis: MaintenanceBasis.CALENDAR,
        frequencyDays: null,
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );

      await expect(service.complete('schedule-1', userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.complete('schedule-1', userId)).rejects.toThrow(
        'no frequencyDays set',
      );
    });

    it('should complete a RUNTIME schedule and calculate next due hours', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Filter Replacement',
        basis: MaintenanceBasis.RUNTIME,
        frequencyHours: new Prisma.Decimal(500),
        currentRunHours: new Prisma.Decimal(450),
        nextDueAtHours: new Prisma.Decimal(500),
      };

      const updatedSchedule = {
        ...mockSchedule,
        nextDueAtHours: new Prisma.Decimal(950),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue(
        updatedSchedule,
      );

      const result = await service.complete('schedule-1', userId);

      expect(mockPrismaService.maintenanceSchedule.update).toHaveBeenCalledWith(
        {
          where: { id: 'schedule-1' },
          data: expect.objectContaining({
            nextDueAtHours: expect.any(Prisma.Decimal),
          }),
          include: expect.any(Object),
        },
      );
    });

    it('should throw BadRequestException if RUNTIME schedule has no frequencyHours', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Test',
        basis: MaintenanceBasis.RUNTIME,
        frequencyHours: null,
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );

      await expect(service.complete('schedule-1', userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.complete('schedule-1', userId)).rejects.toThrow(
        'no frequencyHours set',
      );
    });
  });

  describe('recordRunHours', () => {
    const userId = 'user-123';

    it('should record run hours for a RUNTIME schedule', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Generator Maintenance',
        basis: MaintenanceBasis.RUNTIME,
        currentRunHours: new Prisma.Decimal(100),
        nextDueAtHours: new Prisma.Decimal(500),
        inventoryItem: { name: 'Generator A', campus: 'Main' },
      };

      const updatedSchedule = {
        ...mockSchedule,
        currentRunHours: new Prisma.Decimal(150),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue(
        updatedSchedule,
      );
      mockPrismaService.runHourReading.create.mockResolvedValue({
        id: 'reading-1',
      });

      const result = await service.recordRunHours('schedule-1', userId, {
        hours: 150,
      });

      expect(mockPrismaService.runHourReading.create).toHaveBeenCalledWith({
        data: {
          maintenanceScheduleId: 'schedule-1',
          hours: expect.any(Prisma.Decimal),
          recordedById: userId,
        },
      });
      expect(mockPrismaService.maintenanceSchedule.update).toHaveBeenCalledWith(
        {
          where: { id: 'schedule-1' },
          data: { currentRunHours: expect.any(Prisma.Decimal) },
          include: expect.any(Object),
        },
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_RUN_HOURS' }),
      );
    });

    it('should throw BadRequestException for CALENDAR schedule', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Calendar Schedule',
        basis: MaintenanceBasis.CALENDAR,
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );

      await expect(
        service.recordRunHours('schedule-1', userId, { hours: 150 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recordRunHours('schedule-1', userId, { hours: 150 }),
      ).rejects.toThrow('Run hours only apply to RUNTIME schedules');
    });

    it('should throw BadRequestException if new reading is lower than current', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Generator Maintenance',
        basis: MaintenanceBasis.RUNTIME,
        currentRunHours: new Prisma.Decimal(150),
        nextDueAtHours: new Prisma.Decimal(500),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );

      await expect(
        service.recordRunHours('schedule-1', userId, { hours: 100 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recordRunHours('schedule-1', userId, { hours: 100 }),
      ).rejects.toThrow('cannot be lower than the last recorded reading');
    });

    it('should auto-create work request when run hours cross threshold', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Generator Maintenance',
        basis: MaintenanceBasis.RUNTIME,
        currentRunHours: new Prisma.Decimal(400),
        nextDueAtHours: new Prisma.Decimal(500),
        inventoryItem: {
          name: 'Generator A',
          campus: 'Main',
          maintainableAssetProfile: null,
        },
      };

      const updatedSchedule = {
        ...mockSchedule,
        currentRunHours: new Prisma.Decimal(550),
        nextDueAtHours: new Prisma.Decimal(500),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValueOnce(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue(
        updatedSchedule,
      );
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValueOnce(
        updatedSchedule,
      );
      mockPrismaService.runHourReading.create.mockResolvedValue({
        id: 'reading-1',
      });
      mockPrismaService.workRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.office.upsert.mockResolvedValue({ id: 'office-1' });
      mockPrismaService.sequenceCounter.upsert.mockResolvedValue({ count: 1 });
      mockPrismaService.workRequest.create.mockResolvedValue({ id: 'wr-1' });

      await service.recordRunHours('schedule-1', userId, { hours: 550 });

      expect(mockPrismaService.workRequest.create).toHaveBeenCalled();
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTO_CREATE_WORK_REQUEST' }),
      );
    });

    it('should not create work request if one already exists', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        title: 'Generator Maintenance',
        basis: MaintenanceBasis.RUNTIME,
        currentRunHours: new Prisma.Decimal(400),
        nextDueAtHours: new Prisma.Decimal(500),
        inventoryItem: { name: 'Generator A', campus: 'Main' },
      };

      const updatedSchedule = {
        ...mockSchedule,
        currentRunHours: new Prisma.Decimal(550),
      };

      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValueOnce(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue(
        updatedSchedule,
      );
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValueOnce(
        updatedSchedule,
      );
      mockPrismaService.runHourReading.create.mockResolvedValue({
        id: 'reading-1',
      });
      mockPrismaService.workRequest.findFirst.mockResolvedValue({
        id: 'existing-wr',
      });

      await service.recordRunHours('schedule-1', userId, { hours: 550 });

      expect(mockPrismaService.workRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    const userId = 'user-123';

    it('should deactivate a maintenance schedule', async () => {
      const mockSchedule = { id: 'schedule-1', title: 'Test Schedule' };
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(
        mockSchedule,
      );
      mockPrismaService.maintenanceSchedule.update.mockResolvedValue({
        ...mockSchedule,
        isActive: false,
      });

      const result = await service.deactivate('schedule-1', userId);

      expect(mockPrismaService.maintenanceSchedule.update).toHaveBeenCalledWith(
        {
          where: { id: 'schedule-1' },
          data: { isActive: false },
        },
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEACTIVATE' }),
      );
      expect(result).toEqual({ message: 'Maintenance schedule deactivated.' });
    });

    it('should throw NotFoundException if schedule not found', async () => {
      mockPrismaService.maintenanceSchedule.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('non-existent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
