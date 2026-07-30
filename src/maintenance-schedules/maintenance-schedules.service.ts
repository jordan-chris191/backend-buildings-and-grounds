// src/maintenance-schedules/maintenance-schedules.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';

@Injectable()
export class MaintenanceSchedulesService {
  private readonly logger = new Logger(MaintenanceSchedulesService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateMaintenanceScheduleDto) {
    return this.prisma.maintenanceSchedule.create({
      data: {
        title: dto.title,
        inventoryItemId: dto.inventoryItemId,
        frequencyDays: dto.frequencyDays,
        nextDueAt: new Date(dto.nextDueAt),
        createdById: userId,
      },
    });
  }

  async findAll() {
    return this.prisma.maintenanceSchedule.findMany({
      where: { isActive: true },
      orderBy: { nextDueAt: 'asc' },
      include: { inventoryItem: true },
    });
  }

  async deactivate(id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found');
    }
    return this.prisma.maintenanceSchedule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async generateReferenceNo(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'WR', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WR', year, count: 1 },
    });
    return `WR-${year}-${counter.count.toString().padStart(4, '0')}`;
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkAndGenerateDueRequests() {
    const dueSchedules = await this.prisma.maintenanceSchedule.findMany({
      where: { isActive: true, nextDueAt: { lte: new Date() } },
      include: { inventoryItem: true },
    });

    for (const schedule of dueSchedules) {
      const referenceNo = await this.generateReferenceNo();

      const workRequest = await this.prisma.workRequest.create({
        data: {
          referenceNo,
          requestType: 'REGULAR_MAINTENANCE',
          requestingOffice: 'BG Office (Auto-generated)',
          particulars: `Scheduled maintenance: ${schedule.title}`,
          details: { scheduleId: schedule.id, itemName: schedule.inventoryItem.name },
          inventoryItemId: schedule.inventoryItemId,
          requestedById: schedule.createdById,
        },
      });

      await this.prisma.maintenanceSchedule.update({
        where: { id: schedule.id },
        data: {
          nextDueAt: new Date(Date.now() + schedule.frequencyDays * 24 * 60 * 60 * 1000),
          lastPerformedAt: new Date(),
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: schedule.createdById,
          title: 'Scheduled maintenance generated',
          message: `${referenceNo}: ${schedule.title}`,
          workRequestId: workRequest.id,
        },
      });

      this.logger.log(`Auto-generated ${referenceNo} for schedule "${schedule.title}"`);
    }
  }
}