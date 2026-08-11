// src/work-requests/work-requests.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  RequestStatus,
  AssignmentRole,
  Campus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { UpdateWorkRequestDto } from './dto/update-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';

@Injectable()
export class WorkRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly defaultInclude = {
    items: {
      include: {
        inventoryItem: true,
      },
    },
    assignments: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    },
    accomplishment: true,
    requestingOffice: true,
    requestedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        office: { select: { name: true } },
      },
    },
  };

  async create(userId: string, dto: CreateWorkRequestDto) {
    const referenceNo = await this.generateReferenceNo();

    return this.prisma.$transaction(async (tx) => {
      const workRequest = await tx.workRequest.create({
        data: {
          referenceNo,
          requestType: dto.requestType,
          particulars: dto.particulars,
          details: dto.details as object,
          status: RequestStatus.PENDING,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          campus: dto.campus,
          requestedById: userId,
          requestingOfficeId: dto.requestingOfficeId,
          maintenanceScheduleId: dto.maintenanceScheduleId,
          items: {
            create: dto.items?.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              description: item.description,
              quantity: new Prisma.Decimal(item.quantity),
            })) ?? [],
          },
        },
        include: this.defaultInclude,
      });

      await this.auditLogService.log({
        action: 'CREATE',
        entityType: 'WorkRequest',
        entityId: workRequest.id,
        description: `Created work request ${referenceNo}`,
        performedById: userId,
      });

      return workRequest;
    });
  }

  private async generateReferenceNo(): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'WORK_REQUEST', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WORK_REQUEST', year, count: 1 },
    });
    const seq = String(sequence.count).padStart(4, '0');
    return `WR-${year}-${seq}`;
  }

  async findAll(status?: RequestStatus, campus?: Campus) {
    return this.prisma.workRequest.findMany({
      where: {
        isActive: true,
        ...(status && { status }),
        ...(campus && { campus }),
      },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const wr = await this.prisma.workRequest.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
    if (!wr) throw new NotFoundException('Work request not found.');
    return wr;
  }

  async update(id: string, userId: string, dto: UpdateWorkRequestDto) {
    const existing = await this.findOne(id);
    if (existing.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Only pending work requests can be updated.');
    }

    const updated = await this.prisma.workRequest.update({
      where: { id },
      data: {
        ...dto,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: this.defaultInclude,
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Updated work request ${existing.referenceNo}`,
      performedById: userId,
    });
    return updated;
  }

  async assign(id: string, userId: string, dto: AssignWorkRequestDto) {
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.PENDING && wr.status !== RequestStatus.ASSIGNED) {
      throw new BadRequestException('Work request cannot be assigned in its current status.');
    }

    const existingAssignment = wr.assignments.find(
      (a) => a.userId === dto.userId && !a.unassignedAt,
    );
    if (existingAssignment) {
      throw new BadRequestException('User is already assigned to this work request.');
    }

    if (dto.role === AssignmentRole.LEAD) {
      const activeLead = wr.assignments.find(
        (a) => a.role === AssignmentRole.LEAD && !a.unassignedAt,
      );
      if (activeLead) throw new BadRequestException('A lead is already assigned.');
    }

    const assignment = await this.prisma.workRequestAssignment.create({
      data: {
        role: dto.role,
        workRequestId: id,
        userId: dto.userId,
      },
    });

    if (wr.status === RequestStatus.PENDING) {
      await this.prisma.workRequest.update({
        where: { id },
        data: { status: RequestStatus.ASSIGNED },
      });
    }

    await this.auditLogService.log({
      action: 'ASSIGN',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Assigned user ${dto.userId} as ${dto.role}`,
      performedById: userId,
    });

    // ✅ Notify the assigned user
    await this.notificationsService.create({
      title: 'You have been assigned',
      message: `You have been assigned as ${dto.role} to work request ${wr.referenceNo}.`,
      userId: dto.userId,
      workRequestId: id,
    });

    // ✅ Notify the requester about the assignment
    await this.notificationsService.create({
      title: 'Work request assigned',
      message: `Your work request ${wr.referenceNo} has been assigned to a team.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async unassign(id: string, assignmentId: string, userId: string) {
    const wr = await this.findOne(id);
    const assignment = wr.assignments.find((a) => a.id === assignmentId);
    if (!assignment || assignment.unassignedAt) {
      throw new BadRequestException('Assignment not found or already ended.');
    }

    await this.prisma.workRequestAssignment.update({
      where: { id: assignmentId },
      data: { unassignedAt: new Date() },
    });

    const activeAssignments = wr.assignments.filter(
      (a) => !a.unassignedAt && a.id !== assignmentId,
    );
    if (activeAssignments.length === 0 && wr.status === RequestStatus.ASSIGNED) {
      await this.prisma.workRequest.update({
        where: { id },
        data: { status: RequestStatus.PENDING },
      });
    }

    await this.auditLogService.log({
      action: 'UNASSIGN',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Removed assignment ${assignmentId} (user ${assignment.userId})`,
      performedById: userId,
    });

    // ✅ Notify the unassigned user
    await this.notificationsService.create({
      title: 'You have been unassigned',
      message: `You have been removed from work request ${wr.referenceNo}.`,
      userId: assignment.userId,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async updateProgress(id: string, progressPercent: number, userId: string) {
    if (progressPercent < 0 || progressPercent > 100) {
      throw new BadRequestException('Progress must be between 0 and 100.');
    }
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.IN_PROGRESS && wr.status !== RequestStatus.ASSIGNED) {
      throw new BadRequestException('Cannot update progress in the current status.');
    }

    const newStatus =
      progressPercent > 0 && wr.status !== RequestStatus.IN_PROGRESS
        ? RequestStatus.IN_PROGRESS
        : undefined;

    await this.prisma.workRequest.update({
      where: { id },
      data: {
        progressPercent,
        ...(newStatus && { status: newStatus }),
      },
    });

    await this.auditLogService.log({
      action: 'PROGRESS_UPDATE',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Progress set to ${progressPercent}%`,
      performedById: userId,
    });

    // ✅ Notify the requester
    await this.notificationsService.create({
      title: 'Progress updated',
      message: `Work request ${wr.referenceNo} is now ${progressPercent}% complete.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async complete(id: string, userId: string, dto: CompleteWorkRequestDto) {
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.IN_PROGRESS && wr.status !== RequestStatus.ASSIGNED) {
      throw new BadRequestException('Work request cannot be completed in its current status.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.workRequest.update({
        where: { id },
        data: { status: RequestStatus.COMPLETED, progressPercent: 100 },
      });

      await tx.workRequestAccomplishment.create({
        data: {
          workRequestId: id,
          bgPersonnelId: userId,
          dateTimeStarted: dto.dateTimeStarted ? new Date(dto.dateTimeStarted) : undefined,
          dateTimeCompleted: dto.dateTimeCompleted
            ? new Date(dto.dateTimeCompleted)
            : new Date(),
          completionDetails: dto.completionDetails as object,
          serviceRating: dto.serviceRating,
          expectationRating: dto.expectationRating,
          comments: dto.comments,
        },
      });

      await this.auditLogService.log({
        action: 'COMPLETE',
        entityType: 'WorkRequest',
        entityId: id,
        description: `Work request ${wr.referenceNo} completed`,
        performedById: userId,
      });

      return tx.workRequest.findUnique({
        where: { id },
        include: this.defaultInclude,
      });
    });

    // ✅ Notify the requester
    await this.notificationsService.create({
      title: 'Work request completed',
      message: `Your work request ${wr.referenceNo} has been completed.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return updated;
  }

  async cancel(id: string, userId: string) {
    const wr = await this.findOne(id);
    if (wr.status === RequestStatus.COMPLETED || wr.status === RequestStatus.CANCELLED) {
      throw new BadRequestException('Work request cannot be cancelled.');
    }

    await this.prisma.workRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, isActive: false },
    });

    await this.auditLogService.log({
      action: 'CANCEL',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Work request ${wr.referenceNo} cancelled`,
      performedById: userId,
    });

    // ✅ Notify the requester
    await this.notificationsService.create({
      title: 'Work request cancelled',
      message: `Your work request ${wr.referenceNo} has been cancelled.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return { message: 'Work request cancelled.' };
  }
}