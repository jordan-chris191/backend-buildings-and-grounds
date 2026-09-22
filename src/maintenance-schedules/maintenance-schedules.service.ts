import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';
import { RecordRunHoursDto } from './dto/record-run-hours.dto';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dto/update-maintenance-schedule.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
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
    private readonly gateway: BorrowRequestsGateway,
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

  private readonly detailInclude = {
    ...this.defaultInclude,
    runHourReadings: {
      orderBy: { recordedAt: 'desc' as const },
      select: {
        id: true,
        hours: true,
        recordedAt: true,
        recordedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    },
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

    let result: {
      schedule: { id: string };
      generatedWorkRequestId: string | null;
    };
    try {
      result = await this.prisma.$transaction(async tx => {
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
        let generatedWorkRequestId: string | null = null;
        if (dto.basis === MaintenanceBasis.CALENDAR) {
          const workRequest = await this.createWorkRequestForSchedule(
            created,
            item,
            userId,
            tx,
            `calendar:${created.nextDueAt!.toISOString()}`,
          );
          generatedWorkRequestId = workRequest.id;
        }
        await this.auditLogService.log({ action: 'CREATE', entityType: 'MaintenanceSchedule', entityId: created.id, description: `Created maintenance schedule "${created.title}" (${created.basis}) for item ${item.name}`, performedById: userId }, tx);
        return { schedule: created, generatedWorkRequestId };
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

    if (result.generatedWorkRequestId) {
      this.gateway.emitWorkRequestUpdated(
        result.generatedWorkRequestId,
        result.schedule.id,
      );
    }

    return this.findOne(result.schedule.id);
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
        createdById: userId,
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

    return workRequest;
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

  async findAll(includeInactive = false) {
    return this.prisma.maintenanceSchedule.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: this.defaultInclude,
      orderBy: { nextDueAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({
      where: { id },
      include: this.detailInclude,
    });
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found.');
    }
    return schedule;
  }

  async update(id: string, userId: string, dto: UpdateMaintenanceScheduleDto) {
    const schedule = await this.findOne(id);
    if (dto.frequencyDays !== undefined && schedule.basis !== MaintenanceBasis.CALENDAR) {
      throw new BadRequestException('frequencyDays can only be changed on CALENDAR schedules.');
    }
    if (dto.frequencyHours !== undefined && schedule.basis !== MaintenanceBasis.RUNTIME) {
      throw new BadRequestException('frequencyHours can only be changed on RUNTIME schedules.');
    }
    if ((dto.frequencyDays !== undefined && dto.frequencyDays < 1) || (dto.frequencyHours !== undefined && dto.frequencyHours < 1)) {
      throw new BadRequestException('Maintenance frequency must be greater than zero.');
    }
    if (dto.frequencyDays !== undefined || dto.frequencyHours !== undefined) {
      const openCycle = await this.prisma.workRequest.findFirst({
        where: { maintenanceScheduleId: id, maintenanceCycleKey: { not: null }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      });
      if (openCycle) throw new ConflictException('Cannot change frequency while a generated maintenance work request is open.');
    }
    // The current due date/threshold identifies the existing cycle. An interval
    // edit applies to the next advancement, preserving that cycle's identity.
    const updated = await this.prisma.maintenanceSchedule.update({
      where: { id },
      data: {
        title: dto.title,
        notes: dto.notes,
        frequencyDays: dto.frequencyDays,
        frequencyHours: dto.frequencyHours === undefined ? undefined : new Prisma.Decimal(dto.frequencyHours),
      },
    });
    await this.auditLogService.log({ action: 'UPDATE', entityType: 'MaintenanceSchedule', entityId: id, description: `Updated maintenance schedule "${updated.title}"`, performedById: userId });
    return this.findOne(id);
  }

  async reactivate(id: string, userId: string) {
    const schedule = await this.findOne(id);
    if (schedule.isActive) throw new ConflictException('Maintenance schedule is already active.');
    if (!schedule.inventoryItem.isActive || !schedule.inventoryItem.maintainableAssetProfile?.isActive) {
      throw new BadRequestException('The inventory item and its maintainable-asset profile must be active before reactivation.');
    }
    try {
      await this.prisma.maintenanceSchedule.update({ where: { id }, data: { isActive: true } });
    } catch (error) {
      if (this.isActiveScheduleUniqueConstraint(error)) {
        throw new ConflictException(`An active ${schedule.basis} maintenance schedule already exists for this inventory item.`);
      }
      throw error;
    }
    await this.auditLogService.log({ action: 'REACTIVATE', entityType: 'MaintenanceSchedule', entityId: id, description: `Maintenance schedule ${id} reactivated`, performedById: userId });
    return this.findOne(id);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async generateDueCalendarWorkRequests() {
    await this.processDueCalendarSchedules();
  }

  /** Testable cron body. It never changes nextDueAt; completion owns advancement. */
  async processDueCalendarSchedules(now = new Date()): Promise<number> {
    const dueSchedules = await this.prisma.maintenanceSchedule.findMany({
      where: { isActive: true, basis: MaintenanceBasis.CALENDAR, nextDueAt: { lte: now } },
      select: { id: true },
    });
    const outcomes = await Promise.allSettled(dueSchedules.map(({ id }) => this.generateDueCalendarWorkRequest(id, now)));
    return outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value).length;
  }

  private async generateDueCalendarWorkRequest(id: string, now: Date): Promise<boolean> {
    const generated = await this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "MaintenanceSchedule" WHERE "id" = ${id} FOR UPDATE`);
      if (locked.length !== 1) return false;
      const schedule = await tx.maintenanceSchedule.findUnique({
        where: { id }, include: { inventoryItem: { include: { maintainableAssetProfile: true } } },
      });
      if (!schedule || !schedule.isActive || schedule.basis !== MaintenanceBasis.CALENDAR || !schedule.nextDueAt || schedule.nextDueAt > now) return false;
      const cycleKey = `calendar:${schedule.nextDueAt.toISOString()}`;
      if (await tx.workRequest.findFirst({ where: { maintenanceScheduleId: id, maintenanceCycleKey: cycleKey } })) return false;
      try {
        const workRequest = await this.createWorkRequestForSchedule(schedule, schedule.inventoryItem, schedule.createdById, tx, cycleKey);
        await this.auditLogService.log({ action: 'AUTO_CREATE_WORK_REQUEST', entityType: 'MaintenanceSchedule', entityId: id, description: `Calendar due cycle ${cycleKey} generated`, performedById: schedule.createdById }, tx);
        return { workRequestId: workRequest.id, maintenanceScheduleId: id };
      } catch (error: any) {
        if (error?.code === 'P2002') return false;
        throw error;
      }
    });
    if (!generated) return false;
    this.gateway.emitWorkRequestUpdated(
      generated.workRequestId,
      generated.maintenanceScheduleId,
    );
    return true;
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
    const newReading = new Prisma.Decimal(dto.hours);

    const generatedWorkRequest = await this.prisma.$transaction(async tx => {
      let generated: { id: string; maintenanceScheduleId: string } | null = null;
      // The lock makes the persisted schedule row the sole authority for both
      // the monotonic comparison and threshold-cycle generation.
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "MaintenanceSchedule"
        WHERE "id" = ${id}
        FOR UPDATE`);
      if (locked.length !== 1) throw new NotFoundException('Maintenance schedule not found.');

      const schedule = await tx.maintenanceSchedule.findUnique({
        where: { id },
        include: this.defaultInclude,
      });
      if (!schedule) throw new NotFoundException('Maintenance schedule not found.');
      if (schedule.basis !== MaintenanceBasis.RUNTIME) {
        throw new BadRequestException('Run hours only apply to RUNTIME schedules.');
      }
      if (schedule.isActive === false) throw new BadRequestException('Maintenance schedule is inactive.');
      if (newReading.lessThan(schedule.currentRunHours)) {
        throw new BadRequestException(
          `New reading (${dto.hours}) cannot be lower than the last recorded reading (${schedule.currentRunHours}).`,
        );
      }

      const updated = await tx.maintenanceSchedule.update({
        where: { id },
        data: { currentRunHours: newReading },
        include: this.defaultInclude,
      });
      await tx.runHourReading.create({ data: { maintenanceScheduleId: id, hours: newReading, recordedById: userId } });
      await this.auditLogService.log({ action: 'RECORD_RUN_HOURS', entityType: 'MaintenanceSchedule', entityId: id, description: `Recorded run hours for "${schedule.title}": ${dto.hours} hrs`, performedById: userId }, tx);
      if (updated.nextDueAtHours && newReading.greaterThanOrEqualTo(updated.nextDueAtHours)) {
        const cycleKey = `runtime:${updated.nextDueAtHours.toString()}`;
        const existingCycle = await tx.workRequest.findFirst({
          where: { maintenanceScheduleId: id, maintenanceCycleKey: cycleKey },
        });
        if (!existingCycle) {
          try {
            const workRequest = await this.createWorkRequestForSchedule(updated, updated.inventoryItem, userId, tx, cycleKey);
            generated = {
              id: workRequest.id,
              maintenanceScheduleId: id,
            };
            await this.auditLogService.log({ action: 'AUTO_CREATE_WORK_REQUEST', entityType: 'MaintenanceSchedule', entityId: id, description: `Runtime threshold ${updated.nextDueAtHours} reached`, performedById: userId }, tx);
          } catch (error: any) {
            // Keep the unique index as defense in depth for non-runtime writers.
            if (error?.code !== 'P2002') throw error;
          }
        }
      }
      return generated;
    });

    if (generatedWorkRequest) {
      this.gateway.emitWorkRequestUpdated(
        generatedWorkRequest.id,
        generatedWorkRequest.maintenanceScheduleId,
      );
    }

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
