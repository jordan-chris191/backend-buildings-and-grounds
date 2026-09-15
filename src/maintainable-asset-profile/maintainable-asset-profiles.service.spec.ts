import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { MaintainableAssetType, MaintenancePriority } from '@prisma/client';
import { MaintainableAssetProfilesService } from './maintainable-asset-profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockPrismaService = {
  $transaction: jest.fn(),
  inventoryItem: { findUnique: jest.fn() },
  maintenanceUnitTypeConfig: { findUnique: jest.fn() },
  maintainableAssetProfile: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  maintenanceSchedule: { count: jest.fn() },
  auditLog: { create: jest.fn() },
};

const mockAuditLogService = { log: jest.fn() };

describe('MaintainableAssetProfilesService', () => {
  let service: MaintainableAssetProfilesService;
  const userId = 'user-1';
  const inventoryItemId = 'item-1';
  const dto = {
    inventoryItemId,
    assetType: MaintainableAssetType.GENERATOR,
    priority: MaintenancePriority.IMPORTANT,
    notes: 'Generator profile',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (callback) =>
      callback({
        maintainableAssetProfile: mockPrismaService.maintainableAssetProfile,
        auditLog: mockPrismaService.auditLog,
      }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintainableAssetProfilesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();
    service = module.get(MaintainableAssetProfilesService);
  });

  it('creates a maintainable profile and records a CREATE audit event', async () => {
    const profile = { id: 'profile-1', ...dto, isActive: true };
    mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
      id: inventoryItemId,
      name: 'Backup Generator',
      maintainableAssetProfile: null,
    });
    mockPrismaService.maintainableAssetProfile.create.mockResolvedValue(
      profile,
    );

    await expect(service.create(userId, dto)).resolves.toEqual(profile);
    expect(
      mockPrismaService.maintainableAssetProfile.create,
    ).toHaveBeenCalled();
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityId: profile.id }),
    );
  });

  it('deactivates a profile after its active schedules have been deactivated', async () => {
    const profile = { id: 'profile-1', inventoryItemId, isActive: true };
    mockPrismaService.maintainableAssetProfile.findUnique.mockResolvedValue(
      profile,
    );
    mockPrismaService.maintenanceSchedule.count.mockResolvedValue(0);

    await service.deactivate(profile.id, userId);

    expect(
      mockPrismaService.maintainableAssetProfile.update,
    ).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { isActive: false },
    });
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE', entityId: profile.id }),
    );
  });

  it('reactivates and updates the same inactive profile record', async () => {
    const existingProfile = { id: 'profile-1', isActive: false };
    const reactivatedProfile = {
      id: existingProfile.id,
      ...dto,
      isActive: true,
    };
    mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
      id: inventoryItemId,
      name: 'Backup Generator',
      maintainableAssetProfile: existingProfile,
    });
    mockPrismaService.maintainableAssetProfile.update.mockResolvedValue(
      reactivatedProfile,
    );

    await expect(service.create(userId, dto)).resolves.toEqual(
      reactivatedProfile,
    );
    expect(
      mockPrismaService.maintainableAssetProfile.create,
    ).not.toHaveBeenCalled();
    expect(
      mockPrismaService.maintainableAssetProfile.update,
    ).toHaveBeenCalledWith({
      where: { id: existingProfile.id },
      data: {
        isActive: true,
        assetType: dto.assetType,
        priority: dto.priority,
        unitTypeConfigId: undefined,
        notes: dto.notes,
      },
      include: expect.any(Object),
    });
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REACTIVATE',
        entityId: existingProfile.id,
      }),
      expect.any(Object),
    );
    expect(mockPrismaService.$transaction).toHaveBeenCalled();
  });

  it('rejects creation when the inventory item already has an active profile', async () => {
    mockPrismaService.inventoryItem.findUnique.mockResolvedValue({
      id: inventoryItemId,
      name: 'Backup Generator',
      maintainableAssetProfile: { id: 'profile-1', isActive: true },
    });

    await expect(service.create(userId, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(
      mockPrismaService.maintainableAssetProfile.create,
    ).not.toHaveBeenCalled();
    expect(
      mockPrismaService.maintainableAssetProfile.update,
    ).not.toHaveBeenCalled();
  });
});
