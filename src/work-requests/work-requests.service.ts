// src/work-requests/work-requests.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  RequestStatus,
  AssignmentRole,
  Campus,
  Prisma,
  ApprovalStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { UpdateWorkRequestDto } from './dto/update-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';
import { ApproveWorkRequestDto } from './dto/approve-work-request.dto';
import { RejectWorkRequestDto } from './dto/reject-work-request.dto';

const PRIVILEGED_ROLES = ['Administrator', 'Building & Grounds Officer'];

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
    approvedBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    rejectedBy: {
      select: { id: true, firstName: true, lastName: true },
    },
  };

  private async requesterForCreate(tx: Prisma.TransactionClient, actorId: string, requestedById?: string) {
    const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true } });
    if (!actor?.isActive) throw new ForbiddenException('Active authenticated user required.');
    const privileged = PRIVILEGED_ROLES.includes(actor.role.name);
    if (requestedById && requestedById !== actorId && !privileged) throw new ForbiddenException('You cannot create a request on behalf of another user.');
    const requester = requestedById && privileged
      ? await tx.user.findUnique({ where: { id: requestedById }, include: { office: true } })
      : await tx.user.findUnique({ where: { id: actorId }, include: { office: true } });
    if (!requester?.isActive) throw new BadRequestException('Requester must exist and be active.');
    return requester;
  }

  private async authorizeOperationalActor(tx: Prisma.TransactionClient, workRequestId: string, userId: string, role?: string) {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user?.isActive) throw new ForbiddenException('Active user required.');
    if (PRIVILEGED_ROLES.includes(role ?? user.role.name)) return;
    const operationalRoles = ['Staff', 'Campus Staff', 'Property Custodian'];
    if (!operationalRoles.includes(user.role.name)) throw new ForbiddenException('Operational role required.');
    const assignment = await tx.workRequestAssignment.findFirst({ where: { workRequestId, userId, unassignedAt: null } });
    if (!assignment) throw new ForbiddenException('An active assignment is required.');
  }

  async create(userId: string, dto: CreateWorkRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const requester = await this.requesterForCreate(tx, userId, dto.requestedById);
      const office = dto.requestingOfficeId ? await tx.office.findUnique({ where: { id: dto.requestingOfficeId } }) : requester.office;
      if (!office?.isActive) throw new BadRequestException('Requesting office must exist and be active.');
      if (office.campus !== dto.campus) throw new BadRequestException('Request campus must match the requesting office campus.');
      if (requester.officeId && requester.officeId !== office.id) throw new BadRequestException('Requester does not belong to the requesting office.');
      const items = dto.items ?? [];
      if (new Set(items.map(item => item.inventoryItemId)).size !== items.length) throw new ConflictException('Duplicate work-request item lines are not allowed.');
      for (const item of items) {
        if (!(Number(item.quantity) > 0)) throw new BadRequestException('Material quantities must be greater than zero.');
        const inventory = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
        if (!inventory?.isActive) throw new BadRequestException(`Material ${item.inventoryItemId} must exist and be active.`);
        const stock = await tx.inventoryStock.findUnique({ where: { inventoryItemId_campus: { inventoryItemId: item.inventoryItemId, campus: dto.campus } } });
        if (!stock?.isActive) throw new BadRequestException(`Material ${item.inventoryItemId} has no active balance at the request campus.`);
      }
      const referenceNo = await this.generateReferenceNo();
      const workRequest = await tx.workRequest.create({
        data: {
          referenceNo,
          requestType: dto.requestType,
          particulars: dto.particulars,
          details: dto.details as object,
          status: RequestStatus.PENDING,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          campus: dto.campus,
          priority: dto.priority ?? undefined,
          requestedById: requester.id,
          requestingOfficeId: office.id,
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
      }, tx);

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

  async findAll(
    status?: RequestStatus,
    campus?: Campus,
    assignedToUserId?: string,
    includeInactive = false,
  ) {
    return this.prisma.workRequest.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(status && { status }),
        ...(campus && { campus }),
        ...(assignedToUserId && {
          assignments: {
            some: {
              userId: assignedToUserId,
              unassignedAt: null,
            },
          },
        }),
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
    const allowedStatuses: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.ASSIGNED];
if (!allowedStatuses.includes(existing.status)) {
  throw new BadRequestException('This can only be edited while pending or assigned.');
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

  async approve(id: string, userId: string, dto: ApproveWorkRequestDto) {
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Only pending work requests can be approved.');
    }
    if (wr.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This work request has already been reviewed.');
    }

    const approved = await this.prisma.workRequest.updateMany({
      where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.PENDING },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvalNotes: dto.notes,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });
    if (approved.count !== 1) throw new ConflictException('Work request was reviewed concurrently.');

    await this.auditLogService.log({
      action: 'APPROVE',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Approved work request ${wr.referenceNo}`,
      performedById: userId,
    });

    await this.notificationsService.create({
      title: 'Work request approved',
      message: `Your work request ${wr.referenceNo} has been approved.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async reject(id: string, userId: string, dto: RejectWorkRequestDto) {
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Only pending work requests can be rejected.');
    }
    if (wr.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This work request has already been reviewed.');
    }

    const rejected = await this.prisma.workRequest.updateMany({
      where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.PENDING },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: dto.reason,
        rejectedAt: new Date(),
        rejectedById: userId,
        status: RequestStatus.CANCELLED,
        isActive: false,
      },
    });
    if (rejected.count !== 1) throw new ConflictException('Work request was reviewed concurrently.');

    await this.auditLogService.log({
      action: 'REJECT',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Rejected work request ${wr.referenceNo}: ${dto.reason}`,
      performedById: userId,
    });

    await this.notificationsService.create({
      title: 'Work request rejected',
      message: `Your work request ${wr.referenceNo} was rejected: ${dto.reason}`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    const wr = await this.findOne(id);
    if (wr.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Only pending work requests can be deleted.');
    }

    await this.prisma.workRequest.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogService.log({
      action: 'DELETE',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Deleted work request ${wr.referenceNo}`,
      performedById: userId,
    });

    return { message: 'Work request deleted.' };
  }

  async assign(id: string, userId: string, dto: AssignWorkRequestDto) {
    const wr = await this.findOne(id);

   const assignableStatuses: RequestStatus[] = [
  RequestStatus.PENDING,
  RequestStatus.ASSIGNED,
  RequestStatus.IN_PROGRESS,
];
if (!assignableStatuses.includes(wr.status)) {
  throw new BadRequestException('Work request cannot be assigned in its current status.');
}

    if (wr.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new BadRequestException('Work request must be approved before staff can be assigned.');
    }

    await this.prisma.$transaction(async tx => {
      const assignee = await tx.user.findUnique({ where: { id: dto.userId }, include: { role: true, position: true } });
      if (!assignee?.isActive || !assignee.position?.isActive) throw new BadRequestException('Assignee and position must be active.');
      if (!['Staff', 'Campus Staff', 'Property Custodian', ...PRIVILEGED_ROLES].includes(assignee.role.name)) throw new BadRequestException('Assignee does not have an operational role.');
      try {
        await tx.workRequestAssignment.create({ data: { role: dto.role, workRequestId: id, userId: dto.userId } });
      } catch (error: any) {
        if (error?.code === 'P2002') throw new ConflictException(dto.role === AssignmentRole.LEAD ? 'An active lead already exists.' : 'User is already actively assigned.');
        throw error;
      }
      const changed = await tx.workRequest.updateMany({ where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.APPROVED }, data: { status: RequestStatus.ASSIGNED } });
      if (wr.status === RequestStatus.PENDING && changed.count !== 1) throw new ConflictException('Work request state changed concurrently.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.log({
      action: 'ASSIGN',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Assigned user ${dto.userId} as ${dto.role}`,
      performedById: userId,
    });

    await this.notificationsService.create({
      title: 'You have been assigned',
      message: `You have been assigned as ${dto.role} to work request ${wr.referenceNo}.`,
      userId: dto.userId,
      workRequestId: id,
    });

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

    if (
      wr.status === RequestStatus.COMPLETED ||
      wr.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot unassign from a completed or cancelled work request.',
      );
    }

    const assignment = wr.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new BadRequestException('Assignment not found for this work request.');
    }

    if (assignment.unassignedAt) {
      return this.findOne(id);
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

    await this.notificationsService.create({
      title: 'You have been unassigned',
      message: `You have been removed from work request ${wr.referenceNo}.`,
      userId: assignment.userId,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async updateProgress(id: string, progressPercent: number, userId: string, note?: string, userRole?: string) {
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

    await this.prisma.$transaction(async (tx) => {
      await this.authorizeOperationalActor(tx, id, userId, userRole);
      const changed = await tx.workRequest.updateMany({
        where: { id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } },
        data: {
          progressPercent,
          ...(newStatus && { status: newStatus }),
        },
      });
      if (changed.count !== 1) throw new ConflictException('Work request state changed concurrently.');

      if (progressPercent > 0) {
        const existingAccomplishment = await tx.workRequestAccomplishment.findUnique({
          where: { workRequestId: id },
        });

        if (existingAccomplishment) {
          if (!existingAccomplishment.dateTimeStarted || note) {
            await tx.workRequestAccomplishment.update({
              where: { id: existingAccomplishment.id },
              data: {
                dateTimeStarted: existingAccomplishment.dateTimeStarted ?? new Date(),
                comments: note ?? existingAccomplishment.comments,
              },
            });
          }
        } else {
          await tx.workRequestAccomplishment.create({
            data: {
              workRequestId: id,
              bgPersonnelId: userId,
              dateTimeStarted: new Date(),
              comments: note,
            },
          });
        }
      }
      await this.auditLogService.log({ action: 'PROGRESS_UPDATE', entityType: 'WorkRequest', entityId: id, description: `Progress set to ${progressPercent}%`, performedById: userId }, tx);
    });

    await this.notificationsService.create({
      title: 'Progress updated',
      message: `Work request ${wr.referenceNo} is now ${progressPercent}% complete.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return this.findOne(id);
  }

  async complete(
    id: string,
    userId: string,
    dto: CompleteWorkRequestDto,
    userRole?: string,
  ) {
    const wr = await this.findOne(id);
    const isPrivileged = userRole ? PRIVILEGED_ROLES.includes(userRole) : false;

    // ---------- 1. Rating / feedback update (work request already completed) ----------
    if (wr.status === RequestStatus.COMPLETED) {
      if (!isPrivileged && wr.requestedById !== userId) {
        throw new ForbiddenException(
          'Only the requester can submit feedback for this work request.',
        );
      }

      if (!wr.accomplishment) {
        throw new BadRequestException(
          'This work request has no completion record. Please contact an administrator.',
        );
      }

      await this.prisma.workRequestAccomplishment.update({
        where: { id: wr.accomplishment.id },
        data: {
          serviceRating: dto.serviceRating,
          expectationRating: dto.expectationRating,
          comments: dto.comments,
          completionDetails: dto.completionDetails
            ? (dto.completionDetails as object)
            : undefined,
        },
      });

      await this.auditLogService.log({
        action: 'COMPLETE_UPDATE',
        entityType: 'WorkRequest',
        entityId: id,
        description: `Updated feedback for work request ${wr.referenceNo}`,
        performedById: userId,
      });

      const activeAssignees = wr.assignments.filter(
        (a) => !a.unassignedAt && a.userId !== userId,
      );
      for (const assignment of activeAssignees) {
        await this.notificationsService.create({
          title: 'Work request rated',
          message: `Your work on ${wr.referenceNo} has been rated.`,
          userId: assignment.userId,
          workRequestId: id,
        });
      }

      return this.findOne(id);
    }

    // ---------- 2. Staff completion (first time) ----------
    if (wr.status !== RequestStatus.IN_PROGRESS && wr.status !== RequestStatus.ASSIGNED) {
      throw new BadRequestException('Work request cannot be completed in its current status.');
    }

    const cannotBeRepaired = dto.cannotBeRepaired === true;
    const startedAt = dto.dateTimeStarted ? new Date(dto.dateTimeStarted) : wr.accomplishment?.dateTimeStarted ?? new Date();
    const completedAt = dto.dateTimeCompleted ? new Date(dto.dateTimeCompleted) : new Date();
    if (completedAt < startedAt) throw new BadRequestException('Completion time cannot be before start time.');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.authorizeOperationalActor(tx, id, userId, userRole);
      const changed = await tx.workRequest.updateMany({
        where: { id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } },
        data: {
          status: cannotBeRepaired ? RequestStatus.CANCELLED : RequestStatus.COMPLETED,
          progressPercent: 100,
          isActive: !cannotBeRepaired,
        },
      });
      if (changed.count !== 1) throw new ConflictException('Work request was completed concurrently.');

      if (wr.accomplishment) {
        await tx.workRequestAccomplishment.update({
          where: { id: wr.accomplishment.id },
          data: {
            dateTimeStarted:
              startedAt,
            dateTimeCompleted: completedAt,
            completionDetails: dto.completionDetails as object,
            serviceRating: dto.serviceRating,
            expectationRating: dto.expectationRating,
            comments: dto.comments,
          },
        });
      } else {
        await tx.workRequestAccomplishment.create({
          data: {
            workRequestId: id,
            bgPersonnelId: userId,
            dateTimeStarted: startedAt,
            dateTimeCompleted: completedAt,
            completionDetails: dto.completionDetails as object,
            serviceRating: dto.serviceRating,
            expectationRating: dto.expectationRating,
            comments: dto.comments,
          },
        });
      }

      await this.auditLogService.log({
        action: cannotBeRepaired ? 'CANCELLED' : 'COMPLETE',
        entityType: 'WorkRequest',
        entityId: id,
        description: cannotBeRepaired
          ? `Work request ${wr.referenceNo} cancelled due to irreparable item`
          : `Work request ${wr.referenceNo} completed`,
        performedById: userId,
      });

      return tx.workRequest.findUnique({
        where: { id },
        include: this.defaultInclude,
      });
    });

    if (cannotBeRepaired) {
      await this.notificationsService.create({
        title: 'Work request cancelled',
        message: `Work request ${wr.referenceNo} has been cancelled because the item cannot be repaired.`,
        userId: wr.requestedById,
        workRequestId: id,
      });
    } else {
      await this.notificationsService.create({
        title: 'Work request completed',
        message: `Your work request ${wr.referenceNo} has been completed.`,
        userId: wr.requestedById,
        workRequestId: id,
      });
    }

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

    await this.notificationsService.create({
      title: 'Work request cancelled',
      message: `Your work request ${wr.referenceNo} has been cancelled.`,
      userId: wr.requestedById,
      workRequestId: id,
    });

    return { message: 'Work request cancelled.' };
  }
}
