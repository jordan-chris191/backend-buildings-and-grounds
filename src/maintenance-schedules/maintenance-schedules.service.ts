import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { RequestType, RequestStatus, Prisma } from '@prisma/client';

@Injectable()
export class MaintenanceSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private readonly defaultInclude = {
    inventoryItem: true,
    createdBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    workRequests: true,
  };

  async create(userId: string, dto: CreateMaintenanceScheduleDto) {
    // Step 1: create the schedule (before generating work request, to get its id)
    const schedule = await this.prisma.maintenanceSchedule.create({
      data: {
        title: dto.title,
        frequencyDays: dto.frequencyDays,
        nextDueAt: new Date(dto.nextDueAt),
        inventoryItemId: dto.inventoryItemId,
        createdById: userId,
      },
      include: this.defaultInclude,
    });

    // Step 2: find or create the BG Office and get its id
    const office = await this.prisma.office.upsert({
      where: {
        name_campus: {
          name: 'BG Office',
          campus: schedule.inventoryItem.campus,
        },
      },
      update: {},
      create: {
        name: 'BG Office',
        campus: schedule.inventoryItem.campus,
      },
    });

    // Step 3: generate a unique reference number for the work request
    const referenceNo = await this.generateWorkRequestReferenceNo();

    // Step 4: create the initial work request with the generated reference
    await this.prisma.workRequest.create({
      data: {
        referenceNo,                              // <-- required field added
        requestType: RequestType.REGULAR_MAINTENANCE,
        particulars: `Scheduled: ${schedule.title}`,
        campus: schedule.inventoryItem.campus,
        requestedById: userId,
        requestingOfficeId: office.id,
        maintenanceScheduleId: schedule.id,
        items: {
          create: [
            {
              inventoryItemId: schedule.inventoryItemId,
              quantity: new Prisma.Decimal(1),
              description: 'Scheduled maintenance',
            },
          ],
        },
      },
    });

    // Step 5: audit log
    await this.auditLogService.log({
      action: 'CREATE',
      entityType: 'MaintenanceSchedule',
      entityId: schedule.id,
      description: `Created maintenance schedule "${schedule.title}" for item ${schedule.inventoryItemId}`,
      performedById: userId,
    });

    return this.findOne(schedule.id);
  }

  // Helper: generate reference number for auto-created work requests
  private async generateWorkRequestReferenceNo(): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'WORK_REQUEST', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WORK_REQUEST', year, count: 1 },
    });
    const seq = String(sequence.count).padStart(4, '0');
    return `WR-${year}-${seq}`;
  }

  // ... rest of your methods unchanged ...
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
    const updated = await this.prisma.maintenanceSchedule.update({
      where: { id },
      data: {
        lastPerformedAt: new Date(),
        nextDueAt: new Date(Date.now() + schedule.frequencyDays * 24 * 60 * 60 * 1000),
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'COMPLETE',
      entityType: 'MaintenanceSchedule',
      entityId: id,
      description: `Maintenance "${schedule.title}" completed. Next due at ${updated.nextDueAt}`,
      performedById: userId,
    });

    return updated;
  }

  async deactivate(id: string, userId: string) {
    await this.findOne(id);
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