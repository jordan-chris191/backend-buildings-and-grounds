import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RecordRunHoursDto } from './dto/record-run-hours.dto';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import {
  RequestType,
  Prisma,
  MaintenanceBasis,
  AssetTypeConfig,
} from '@prisma/client';

@Injectable()
export class MaintenanceSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private isActiveScheduleUniqueConstraint(error: unknown): boolean {
    const prismaError = error as {
      code?: string;
      meta?: { target?: unknown };
    };

    if (prismaError.code !== 'P2002') {
      return false;
    }

    const target = prismaError.meta?.target;
    return (
      target === 'MaintenanceSchedule_active_inventoryItemId_basis_key' ||
      (Array.isArray(target) &&
        target.length === 2 &&
        target.includes('inventoryItemId') &&
        target.includes('basis'))
    );
  }

  private readonly defaultInclude = {
    inventoryItem: {
      include: {
        maintainableAssetProfile: { include: { unitTypeConfig: true } },
      },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    workRequests: true,
  };

  async create(userId: string, dto: CreateMaintenanceScheduleDto) {
    // Step 1: validate the item exists and is tagged as maintainable
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
      include: {
        maintainableAssetProfile: { include: { unitTypeConfig: true } },
      },
    });
    if (!item) {
      throw new BadRequestException('Inventory item not found.');
    }
    if (!item.maintainableAssetProfile) {
      throw new BadRequestException(
        'This inventory item has no maintainable-asset profile. Create one via /maintainable-asset-profiles before scheduling maintenance.',
      );
    }
    if (item.maintainableAssetProfile.isActive === false) {
      throw new BadRequestException(
        'This inventory item has an inactive maintainable-asset profile. Reactivate it before scheduling maintenance.',
      );
    }

    // Step 2: resolve frequencyDays (explicit value, or fall back to unit type config default)
    let frequencyDays = dto.frequencyDays;
    if (dto.basis === MaintenanceBasis.CALENDAR && !frequencyDays) {
      frequencyDays =
        item.maintainableAssetProfile.unitTypeConfig?.defaultCooldownDays;
    }
    if (dto.basis === MaintenanceBasis.CALENDAR && !frequencyDays) {
      throw new BadRequestException(
        "frequencyDays is required for CALENDAR schedules (directly, or via the profile's unit type config).",
      );
    }
    if (dto.basis === MaintenanceBasis.RUNTIME && !dto.frequencyHours) {
      throw new BadRequestException(
        'frequencyHours is required for RUNTIME schedules.',
      );
    }

    // Step 3: create the schedule
    if (dto.basis === MaintenanceBasis.CALENDAR && !dto.nextDueAt) {
      throw new BadRequestException(
        'nextDueAt is required for CALENDAR schedules.',
      );
    }

    const activeSchedule = await this.prisma.maintenanceSchedule.findFirst({
      where: {
        inventoryItemId: dto.inventoryItemId,
        basis: dto.basis,
        isActive: true,
      },
    });
    if (activeSchedule) {
      throw new ConflictException(
        `An active ${dto.basis} maintenance schedule already exists for this inventory item.`,
      );
    }

    let schedule;
    try {
      schedule = await this.prisma.$transaction(async tx => {
        const created = await tx.maintenanceSchedule.create({
        data: {
          title: dto.title,
          basis: dto.basis,
          frequencyDays:
            dto.basis === MaintenanceBasis.CALENDAR ? frequencyDays : null,
          nextDueAt:
            dto.basis === MaintenanceBasis.CALENDAR
              ? new Date(dto.nextDueAt!)
              : null,
          frequencyHours:
            dto.basis === MaintenanceBasis.RUNTIME
              ? new Prisma.Decimal(dto.frequencyHours!)
              : null,
          nextDueAtHours:
            dto.basis === MaintenanceBasis.RUNTIME
              ? new Prisma.Decimal(dto.frequencyHours!)
              : null,
          notes: dto.notes,
          inventoryItemId: dto.inventoryItemId,
          createdById: userId,
        },
        include: this.defaultInclude,
        });
        if (dto.basis === MaintenanceBasis.CALENDAR) {
          await this.createWorkRequestForSchedule(created, item, userId, tx, `calendar:${created.nextDueAt!.toISOString()}`);
        }
        await this.auditLogService.log({ action: 'CREATE', entityType: 'MaintenanceSchedule', entityId: created.id, description: `Created maintenance schedule "${created.title}" (${created.basis}) for item ${item.name}`, performedById: userId }, tx);
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // The partial unique index is the authoritative concurrency safeguard.
      if (this.isActiveScheduleUniqueConstraint(error)) {
        throw new ConflictException(
          `An active ${dto.basis} maintenance schedule already exists for this inventory item.`,
        );
      }
      throw error;
    }

    return this.findOne(schedule.id);
  }

  private async createWorkRequestForSchedule(
    schedule: {
      id: string;
      title: string;
      inventoryItemId: string;
      basis: MaintenanceBasis;
    },
    item: {
      campus: any;
      name: string;
      maintainableAssetProfile?: { assetType: string } | null;
    },
    userId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    cycleKey?: string,
  ) {
    const office = await client.office.upsert({
      where: { name_campus: { name: 'BG Office', campus: item.campus } },
      update: {},
      create: { name: 'BG Office', campus: item.campus },
    });

    const referenceNo = await this.generateWorkRequestReferenceNo(client);

    const particulars =
      schedule.basis === MaintenanceBasis.CALENDAR
        ? `Scheduled: ${schedule.title} — ${item.name}`
        : `Runtime threshold reached: ${schedule.title} — ${item.name}`;

    const workRequest = await client.workRequest.create({
      data: {
        referenceNo,
        requestType: RequestType.REGULAR_MAINTENANCE,
        particulars,
        campus: item.campus,
        requestedById: userId,
        requestingOfficeId: office.id,
        maintenanceScheduleId: schedule.id,
        maintenanceCycleKey: cycleKey,
        items: {
          create: [
            {
              inventoryItemId: schedule.inventoryItemId,
              quantity: new Prisma.Decimal(1),
              description:
                schedule.basis === MaintenanceBasis.CALENDAR
                  ? 'Scheduled maintenance'
                  : 'Runtime-triggered maintenance',
            },
          ],
        },
      },
    });

    await this.autoAssignByAssetType(
      workRequest.id,
      item.maintainableAssetProfile?.assetType,
      client,
    );
  }

  private async autoAssignByAssetType(
    workRequestId: string,
    assetType?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!assetType) return; // no profile/type — nothing to resolve, leave unassigned

    const config = await client.assetTypeConfig.findUnique({
      where: { assetType: assetType as any },
    });
    if (!config || !config.isActive) return; // no mapping configured — leave for manual assignment

    const technicians = await client.user.findMany({
      where: { positionId: config.positionId, isActive: true },
    });
    if (technicians.length === 0) return; // position has no active users — nothing to assign

    await client.workRequestAssignment.createMany({
      data: technicians.map((tech) => ({
        workRequestId,
        userId: tech.id,
        role: 'MEMBER' as const,
      })),
    });
  }

  // Helper: generate reference number for auto-created work requests
  private async generateWorkRequestReferenceNo(client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await client.sequenceCounter.upsert({
      where: { type_year: { type: 'WORK_REQUEST', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WORK_REQUEST', year, count: 1 },
    });
    const seq = String(sequence.count).padStart(4, '0');
    return `WR-${year}-${seq}`;
  }

  async findAll() {
    return this.prisma.maintenanceSchedule.findMany({
      where: { isActive: true },
      include: this.defaultInclude,
      orderBy: { nextDueAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found.');
    }
    return schedule;
  }

  async complete(id: string, userId: string) {
    const schedule = await this.findOne(id);
    const generatedWorkRequest = await this.prisma.workRequest.findFirst({ where: { maintenanceScheduleId: id, maintenanceCycleKey: { not: null } } });
    if (generatedWorkRequest) {
      throw new ConflictException('Maintenance schedule advancement is performed by completion of its generated work request.');
    }

    const data: Prisma.MaintenanceScheduleUpdateInput = {
      lastPerformedAt: new Date(),
    };

    if (schedule.basis === MaintenanceBasis.CALENDAR) {
      if (schedule.frequencyDays == null) {
        throw new BadRequestException(
          'This CALENDAR schedule has no frequencyDays set — cannot compute next due date.',
        );
      }
      data.nextDueAt = new Date(
        Date.now() + schedule.frequencyDays * 24 * 60 * 60 * 1000,
      );
    } else {
      if (schedule.frequencyHours == null) {
        throw new BadRequestException(
          'This RUNTIME schedule has no frequencyHours set — cannot compute next due threshold.',
        );
      }
      data.nextDueAtHours = schedule.currentRunHours.plus(
        schedule.frequencyHours,
      );
    }

    const updated = await this.prisma.maintenanceSchedule.update({
      where: { id },
      data,
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'COMPLETE',
      entityType: 'MaintenanceSchedule',
      entityId: id,
      description: `Maintenance "${schedule.title}" completed. Next due: ${
        updated.nextDueAt ?? updated.nextDueAtHours + ' hrs'
      }`,
      performedById: userId,
    });

    return updated;
  }

  async recordRunHours(id: string, userId: string, dto: RecordRunHoursDto) {
    const schedule = await this.findOne(id); // already includes inventoryItem via defaultInclude

    if (schedule.basis !== MaintenanceBasis.RUNTIME) {
      throw new BadRequestException(
        'Run hours only apply to RUNTIME schedules.',
      );
    }

    const newReading = new Prisma.Decimal(dto.hours);
    if (newReading.lessThan(schedule.currentRunHours)) {
      throw new BadRequestException(
        `New reading (${dto.hours}) cannot be lower than the last recorded reading (${schedule.currentRunHours}).`,
      );
    }

    await this.prisma.$transaction(async tx => {
      const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "MaintenanceSchedule" SET "currentRunHours" = ${newReading}
        WHERE id = ${id} AND "isActive" = true AND "currentRunHours" <= ${newReading}
        RETURNING id`);
      if (changed.length !== 1) throw new BadRequestException('Run-hour reading cannot be lower than the current recorded value.');
      await tx.runHourReading.create({ data: { maintenanceScheduleId: id, hours: newReading, recordedById: userId } });
      const updated = (await tx.maintenanceSchedule.findUnique({ where: { id }, include: this.defaultInclude })) ?? schedule;
      await this.auditLogService.log({ action: 'RECORD_RUN_HOURS', entityType: 'MaintenanceSchedule', entityId: id, description: `Recorded run hours for "${schedule.title}": ${dto.hours} hrs`, performedById: userId }, tx);
      if (updated.nextDueAtHours && newReading.greaterThanOrEqualTo(updated.nextDueAtHours)) {
        try {
          await this.createWorkRequestForSchedule(updated, updated.inventoryItem, userId, tx, `runtime:${updated.nextDueAtHours.toString()}`);
          await this.auditLogService.log({ action: 'AUTO_CREATE_WORK_REQUEST', entityType: 'MaintenanceSchedule', entityId: id, description: `Runtime threshold ${updated.nextDueAtHours} reached`, performedById: userId }, tx);
        } catch (error: any) {
          if (error?.code !== 'P2002') throw error;
        }
      }
    });

    return this.findOne(id);
  }

  async deactivate(id: string, userId: string) {
    await this.findOne(id);
    const openWorkRequest = await this.prisma.workRequest.findFirst({ where: { maintenanceScheduleId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } });
    if (openWorkRequest) throw new ConflictException('Cannot deactivate a schedule with an open maintenance work request.');
    await this.prisma.maintenanceSchedule.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DEACTIVATE',
      entityType: 'MaintenanceSchedule',
      entityId: id,
      description: `Maintenance schedule ${id} deactivated`,
      performedById: userId,
    });

    return { message: 'Maintenance schedule deactivated.' };
  }
}
