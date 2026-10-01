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
  WorkRequestSource,
  WorkRequestActivityType,
  ClarificationStatus,
  CompletionOutcome,
  HoldReason,
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
import { CreateWalkInWorkRequestDto } from './dto/create-walk-in-work-request.dto';
import { formatAssignmentRole, formatWorkRequestType } from './work-request-display';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';
import { ClarificationDto, CompleteOnBehalfDto, HoldWorkRequestDto, ManualInformDto, ProgressOnBehalfDto, ReassignWorkRequestDto, ReopenWorkRequestDto } from './dto/lifecycle-work-request.dto';

const PRIVILEGED_ROLES = ['ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER'];

@Injectable()
export class WorkRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: BorrowRequestsGateway,
  ) {}

  private emitWorkRequestUpdated(workRequestId: string, maintenanceScheduleId: string | null = null) {
    this.gateway.emitWorkRequestUpdated(workRequestId, maintenanceScheduleId);
  }

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
            role: { select: { code: true } },
            position: { select: { id: true, name: true } },
          },
        },
      },
    },
    accomplishment: true,
    activities: {
      orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, role: { select: { code: true } }, position: { select: { name: true } }, office: { select: { name: true } } } },
        performedBy: { select: { id: true, firstName: true, lastName: true, role: { select: { code: true } }, position: { select: { name: true } } } },
      },
    },
    requestingOffice: true,
    requestedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        office: { select: { name: true } },
      },
    },
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    approvedBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    rejectedBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    completionRecordedBy: { select: { id: true, firstName: true, lastName: true, role: { select: { code: true } }, position: { select: { name: true } } } },
    completionPerformedBy: { select: { id: true, firstName: true, lastName: true, role: { select: { code: true } }, position: { select: { name: true } } } },
  };

  private async activity(tx: Prisma.TransactionClient, data: { workRequestId: string; type: WorkRequestActivityType; actorId?: string; performedById?: string; metadata?: Prisma.InputJsonValue; occurredAt?: Date }) {
    return tx.workRequestActivity.create({ data });
  }

  private async requesterForCreate(tx: Prisma.TransactionClient, actorId: string, requestedById?: string) {
    const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true } });
    if (!actor?.isActive) throw new ForbiddenException('Active authenticated user required.');
    const privileged = PRIVILEGED_ROLES.includes(actor.role.code);
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
    if (PRIVILEGED_ROLES.includes(role ?? user.role.code)) return;
    const operationalRoles = ['CAMPUS_STAFF', 'PROPERTY_CUSTODIAN'];
    if (!operationalRoles.includes(user.role.code)) throw new ForbiddenException('Operational role required.');
    const assignment = await tx.workRequestAssignment.findFirst({ where: { workRequestId, userId, unassignedAt: null } });
    if (!assignment) throw new ForbiddenException('An active assignment is required.');
  }

  private async authorizePrivilegedActor(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user?.isActive || !user.role.isActive || !PRIVILEGED_ROLES.includes(user.role.code)) {
      throw new ForbiddenException('Administrator or Building & Grounds Officer role required.');
    }
  }

  private async validateMaterials(tx: Prisma.TransactionClient, items: CreateWorkRequestDto['items'], campus: Campus) {
    const lines = items ?? [];
    if (new Set(lines.map(item => item.inventoryItemId)).size !== lines.length) {
      throw new ConflictException('Duplicate work-request item lines are not allowed.');
    }
    for (const item of lines) {
      if (!(Number(item.quantity) > 0)) throw new BadRequestException('Material quantities must be greater than zero.');
      const inventory = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
      if (!inventory?.isActive) throw new BadRequestException(`Material ${item.inventoryItemId} must exist and be active.`);
      const stock = await tx.inventoryStock.findUnique({ where: { inventoryItemId_campus: { inventoryItemId: item.inventoryItemId, campus } } });
      if (!stock?.isActive) throw new BadRequestException(`Material ${item.inventoryItemId} has no active balance at the request campus.`);
    }
  }

  /** Maintenance requests are assigned only after approval, never at generation. */
  private async assignMaintenanceWorkersAfterApproval(
    tx: Prisma.TransactionClient,
    wr: { id: string; referenceNo: string; maintenanceScheduleId: string },
    approvedById: string,
  ): Promise<Array<{ id: string; userId: string }>> {
    const schedule = await tx.maintenanceSchedule.findUnique({
      where: { id: wr.maintenanceScheduleId },
      select: {
        defaultAssigneeId: true,
        inventoryItem: { select: { maintainableAssetProfile: { select: { assetType: true } } } },
      },
    });
    if (!schedule) return [];

    const activeAssignments = await tx.workRequestAssignment.findMany({
      where: { workRequestId: wr.id, unassignedAt: null },
      select: { userId: true, role: true },
    });
    const hasAssignment = (userId: string) => activeAssignments.some(assignment => assignment.userId === userId);
    const assetType = schedule.inventoryItem.maintainableAssetProfile?.assetType;
    const config = assetType
      ? await tx.assetTypeConfig.findUnique({ where: { assetType } })
      : null;

    let assignees: Array<{ id: string; firstName: string; lastName: string }> = [];
    if (schedule.defaultAssigneeId) {
      const preferred = await tx.user.findFirst({
        where: {
          id: schedule.defaultAssigneeId,
          isActive: true,
          ...(config?.isActive && { positionId: config.positionId }),
          role: { code: 'CAMPUS_STAFF', isActive: true },
          position: { is: { isActive: true } },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (preferred && !hasAssignment(preferred.id) && !activeAssignments.some(assignment => assignment.role === AssignmentRole.LEAD)) {
        await tx.workRequestAssignment.create({
          data: { workRequestId: wr.id, userId: preferred.id, role: AssignmentRole.LEAD },
        });
        assignees = [preferred];
      }
    }

    // A legacy or concurrently-added active assignment is already an explicit
    // per-cycle decision; never layer fallback workers on top of it.
    if (assignees.length === 0 && activeAssignments.length === 0) {
      if (config?.isActive) {
        const fallbackWorkers = await tx.user.findMany({
          where: {
            positionId: config.positionId,
            isActive: true,
            role: { code: 'CAMPUS_STAFF', isActive: true },
            position: { is: { isActive: true } },
          },
          select: { id: true, firstName: true, lastName: true },
        });
        for (const worker of fallbackWorkers.filter(worker => !hasAssignment(worker.id))) {
          await tx.workRequestAssignment.create({
            data: { workRequestId: wr.id, userId: worker.id, role: AssignmentRole.MEMBER },
          });
          assignees.push(worker);
        }
      }
    }

    if (assignees.length > 0) {
      await this.auditLogService.log({
        action: 'AUTO_ASSIGN', entityType: 'WorkRequest', entityId: wr.id,
        description: `Automatically assigned maintenance work request ${wr.referenceNo} to ${assignees.map(worker => `${worker.firstName} ${worker.lastName}`).join(', ')}`,
        performedById: approvedById,
      }, tx);
    }
    return Promise.all(assignees.map(worker => this.notificationsService.createInTransaction(tx, {
      type: 'WORK_REQUEST_ASSIGNED', title: 'New Work Assignment',
      message: `${wr.referenceNo}: scheduled maintenance assignment`,
      referenceNo: wr.referenceNo, userId: worker.id, workRequestId: wr.id,
    })));
  }

  private async notifyRequester(
    wr: { requestedById: string | null; referenceNo: string; id: string },
    data: { title: string; message: string; type?: string },
  ) {
    if (!wr.requestedById) return;
    await this.notificationsService.create({ ...data, userId: wr.requestedById, workRequestId: wr.id, referenceNo: wr.referenceNo });
  }

  async create(userId: string, dto: CreateWorkRequestDto) {
    const workRequest = await this.prisma.$transaction(async (tx) => {
      const requester = await this.requesterForCreate(tx, userId, dto.requestedById);
      const office = dto.requestingOfficeId ? await tx.office.findUnique({ where: { id: dto.requestingOfficeId } }) : requester.office;
      if (!office?.isActive) throw new BadRequestException('Requesting office must exist and be active.');
      if (office.campus !== dto.campus) throw new BadRequestException('Request campus must match the requesting office campus.');
      if (requester.officeId && requester.officeId !== office.id) throw new BadRequestException('Requester does not belong to the requesting office.');
      await this.validateMaterials(tx, dto.items, dto.campus);
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
          createdById: userId,
          source: WorkRequestSource.ONLINE,
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
      await this.activity(tx, { workRequestId: workRequest.id, type: WorkRequestActivityType.SUBMITTED, actorId: userId, performedById: requester.id, metadata: { source: WorkRequestSource.ONLINE } });

      return workRequest;
    });
    this.emitWorkRequestUpdated(workRequest.id, workRequest.maintenanceScheduleId);
    return workRequest;
  }

  async createWalkIn(userId: string, dto: CreateWalkInWorkRequestDto) {
    const workRequest = await this.prisma.$transaction(async tx => {
      if (!dto.walkInRequesterName?.trim()) {
        throw new BadRequestException('Walk-in requester name is required.');
      }
      const office = await tx.office.findUnique({ where: { id: dto.requestingOfficeId } });
      if (!office?.isActive) throw new BadRequestException('Requesting office must exist and be active.');
      await this.validateMaterials(tx, dto.items, office.campus);
      const referenceNo = await this.generateReferenceNo();
      const workRequest = await tx.workRequest.create({
        data: {
          referenceNo,
          source: WorkRequestSource.WALK_IN,
          requestType: dto.requestType,
          particulars: dto.particulars,
          details: dto.details as object,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          priority: dto.priority ?? undefined,
          campus: office.campus,
          requestingOfficeId: office.id,
          walkInRequesterName: dto.walkInRequesterName,
          walkInRequesterContact: dto.walkInRequesterContact,
          createdById: userId,
          items: { create: dto.items?.map(item => ({ inventoryItemId: item.inventoryItemId, description: item.description, quantity: new Prisma.Decimal(item.quantity) })) ?? [] },
        },
        include: this.defaultInclude,
      });
      await this.auditLogService.log({ action: 'CREATE_WALK_IN', entityType: 'WorkRequest', entityId: workRequest.id, description: `Created walk-in work request ${referenceNo}`, metadata: { source: WorkRequestSource.WALK_IN }, performedById: userId }, tx);
      await this.activity(tx, { workRequestId: workRequest.id, type: WorkRequestActivityType.SUBMITTED, actorId: userId, metadata: { source: WorkRequestSource.WALK_IN, walkInRequesterName: dto.walkInRequesterName } });
      return workRequest;
    });
    this.emitWorkRequestUpdated(workRequest.id, workRequest.maintenanceScheduleId);
    return workRequest;
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

  /**
   * Read scope used by the public endpoints. Operational users see only
   * active assignments; office requesters see their own requests and requests
   * for their office. Admin and B&G officers retain the operational view.
   */
  private async readScopeForUser(userId: string): Promise<Prisma.WorkRequestWhereInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, officeId: true, role: { select: { code: true, isActive: true } } },
    });
    if (!user?.isActive || !user.role.isActive) {
      throw new ForbiddenException('Active authenticated user required.');
    }
    if (PRIVILEGED_ROLES.includes(user.role.code)) return {};
    if (user.role.code === 'CAMPUS_STAFF') {
      return { assignments: { some: { userId, unassignedAt: null } } };
    }
    if (user.role.code === 'FACULTY' || user.role.code === 'PROPERTY_CUSTODIAN') {
      return {
        OR: [
          { requestedById: userId },
          ...(user.officeId ? [{ requestingOfficeId: user.officeId }] : []),
        ],
      };
    }
    // An authenticated user with an unrecognized role gets no request data.
    return { id: { in: [] } };
  }

  async findAllForUser(
    userId: string,
    status?: RequestStatus,
    source?: WorkRequestSource,
    campus?: Campus,
    assignedToUserId?: string,
    includeInactive = false,
    page = 1,
    limit = 10,
  ) {
    const scope = await this.readScopeForUser(userId);
    const where: Prisma.WorkRequestWhereInput = {
        ...scope,
        ...(includeInactive ? {} : { isActive: true }),
        ...(status && { status }),
        ...(source && { source }),
        ...(campus && { campus }),
        ...(assignedToUserId && {
          assignments: { some: { userId: assignedToUserId, unassignedAt: null } },
        }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.workRequest.findMany({
        where, include: this.defaultInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.workRequest.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async statsForUser(userId: string) {
    const scope = await this.readScopeForUser(userId);
    const base: Prisma.WorkRequestWhereInput = { ...scope, isActive: true };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const metric = (where: Prisma.WorkRequestWhereInput): Prisma.WorkRequestWhereInput => ({ AND: [base, where] });
    const validRating = { gte: 1, lte: 5 };
    const accomplishmentScope: Prisma.WorkRequestAccomplishmentWhereInput = { workRequest: base };
    const [pendingApproval, needsAssignment, assigned, inProgress, onHold, completedThisMonth, totalActive, ratedRequests, serviceRatings, expectationRatings] = await this.prisma.$transaction([
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.PENDING }) }),
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.APPROVED, assignments: { none: { unassignedAt: null } } }) }),
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.ASSIGNED, assignments: { some: { unassignedAt: null } } }) }),
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.IN_PROGRESS }) }),
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.ON_HOLD }) }),
      this.prisma.workRequest.count({ where: metric({ status: RequestStatus.COMPLETED, completedAt: { gte: monthStart, lt: nextMonthStart } }) }),
      this.prisma.workRequest.count({ where: metric({ status: { in: [RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS, RequestStatus.ON_HOLD] } }) }),
      this.prisma.workRequestAccomplishment.count({ where: { ...accomplishmentScope, OR: [{ serviceRating: validRating }, { expectationRating: validRating }] } }),
      this.prisma.workRequestAccomplishment.aggregate({ where: { ...accomplishmentScope, serviceRating: validRating }, _count: { serviceRating: true }, _avg: { serviceRating: true } }),
      this.prisma.workRequestAccomplishment.aggregate({ where: { ...accomplishmentScope, expectationRating: validRating }, _count: { expectationRating: true }, _avg: { expectationRating: true } }),
    ]);
    const ratingResponses = serviceRatings._count.serviceRating + expectationRatings._count.expectationRating;
    const ratingTotal = (serviceRatings._avg.serviceRating ?? 0) * serviceRatings._count.serviceRating
      + (expectationRatings._avg.expectationRating ?? 0) * expectationRatings._count.expectationRating;
    return {
      pendingApproval, needsAssignment, assigned, inProgress, onHold, completedThisMonth, totalActive,
      ratedRequests,
      ratingResponses,
      averageRating: ratingResponses ? ratingTotal / ratingResponses : null,
    };
  }

  async findOneForUser(id: string, userId: string) {
    const scope = await this.readScopeForUser(userId);
    const wr = await this.prisma.workRequest.findFirst({
      where: { id, ...scope },
      include: this.defaultInclude,
    });
    if (!wr) throw new NotFoundException('Work request not found.');
    return wr;
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

    const walkInFieldsPresent = dto.walkInRequesterName !== undefined || dto.walkInRequesterContact !== undefined || dto.requestType !== undefined;
    if (existing.source !== WorkRequestSource.WALK_IN && walkInFieldsPresent) {
      throw new BadRequestException('Walk-in fields can only be edited on walk-in work requests.');
    }
    let campus: Campus | undefined;
    if (dto.requestingOfficeId) {
      const office = await this.prisma.office.findUnique({ where: { id: dto.requestingOfficeId } });
      if (!office?.isActive) throw new BadRequestException('Requesting office must exist and be active.');
      campus = office.campus;
    }
    if (existing.source === WorkRequestSource.WALK_IN && dto.walkInRequesterName !== undefined && !dto.walkInRequesterName.trim()) {
      throw new BadRequestException('Walk-in requester name is required.');
    }

    const updated = await this.prisma.workRequest.update({
      where: { id },
      data: {
        particulars: dto.particulars,
        details: dto.details as object,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        priority: dto.priority,
        requestingOfficeId: dto.requestingOfficeId,
        ...(campus && { campus }),
        ...(existing.source === WorkRequestSource.WALK_IN && {
          requestType: dto.requestType,
          walkInRequesterName: dto.walkInRequesterName,
          walkInRequesterContact: dto.walkInRequesterContact,
        }),
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
    this.emitWorkRequestUpdated(id, existing.maintenanceScheduleId);
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

    let assignmentNotifications: Array<{ id: string; userId: string }> = [];
    await this.prisma.$transaction(async tx => {
      const approved = await tx.workRequest.updateMany({
        where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.PENDING },
        data: {
          approvalStatus: ApprovalStatus.APPROVED,
          approvalNotes: dto.notes,
          approvedAt: new Date(),
          approvedById: userId,
        },
      });
      if (approved.count !== 1) throw new ConflictException('Work request was reviewed concurrently.');
      if (wr.maintenanceScheduleId) {
        assignmentNotifications = await this.assignMaintenanceWorkersAfterApproval(tx, {
          id: wr.id, referenceNo: wr.referenceNo, maintenanceScheduleId: wr.maintenanceScheduleId,
        }, userId);
        if (assignmentNotifications.length > 0) {
          await tx.workRequest.update({ where: { id }, data: { status: RequestStatus.ASSIGNED } });
        }
      }
      await this.auditLogService.log({
        action: 'APPROVE', entityType: 'WorkRequest', entityId: id,
        description: `Approved work request ${wr.referenceNo}`, performedById: userId,
      }, tx);
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.APPROVED, actorId: userId, metadata: { notes: dto.notes } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.notifyRequester(wr, {
      title: 'Work request approved',
      message: `Your work request ${wr.referenceNo} has been approved.`,
    });
    for (const notification of assignmentNotifications) this.notificationsService.emit(notification, notification.userId);
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

    return this.findOne(id);
  }

  async reject(id: string, userId: string, dto: RejectWorkRequestDto) {
    const wr = await this.findOne(id);
    if (wr.maintenanceScheduleId) {
      throw new ConflictException('Scheduled maintenance Work Requests cannot be rejected. Complete the maintenance, reschedule/defer it, or deactivate the Maintenance Schedule instead.');
    }
    if (wr.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Only pending work requests can be rejected.');
    }
    if (wr.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This work request has already been reviewed.');
    }

    const rejected = await this.prisma.$transaction(async tx => {
      const changed = await tx.workRequest.updateMany({ where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.PENDING }, data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: dto.reason,
        rejectedAt: new Date(),
        rejectedById: userId,
        status: RequestStatus.CANCELLED,
        isActive: false,
      } });
      if (changed.count !== 1) throw new ConflictException('Work request was reviewed concurrently.');
      await this.auditLogService.log({
      action: 'REJECT',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Rejected work request ${wr.referenceNo}: ${dto.reason}`,
        performedById: userId,
      }, tx);
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.REJECTED, actorId: userId, metadata: { reason: dto.reason } });
      return changed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.notifyRequester(wr, {
      title: 'Work request rejected',
      message: `Your work request ${wr.referenceNo} was rejected: ${dto.reason}`,
    });
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

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
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

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

    let assignedNotification: { id: string } | undefined;
    await this.prisma.$transaction(async tx => {
      const assignee = await tx.user.findUnique({ where: { id: dto.userId }, include: { role: true, position: true } });
      if (!assignee?.isActive || !assignee.position?.isActive) throw new BadRequestException('Assignee and position must be active.');
      if (!['CAMPUS_STAFF', 'PROPERTY_CUSTODIAN', ...PRIVILEGED_ROLES].includes(assignee.role.code)) throw new BadRequestException('Assignee does not have an operational role.');
      try {
        await tx.workRequestAssignment.create({ data: { role: dto.role, workRequestId: id, userId: dto.userId } });
      } catch (error: any) {
        if (error?.code === 'P2002') throw new ConflictException(dto.role === AssignmentRole.LEAD ? 'An active lead already exists.' : 'User is already actively assigned.');
        throw error;
      }
      const changed = await tx.workRequest.updateMany({ where: { id, status: RequestStatus.PENDING, approvalStatus: ApprovalStatus.APPROVED }, data: { status: RequestStatus.ASSIGNED } });
      if (wr.status === RequestStatus.PENDING && changed.count !== 1) throw new ConflictException('Work request state changed concurrently.');
      assignedNotification = await this.notificationsService.createInTransaction(tx, {
        type: 'WORK_REQUEST_ASSIGNED', title: 'New Work Assignment',
        message: `${wr.referenceNo}: ${formatWorkRequestType(wr.requestType)} at ${wr.campus} (${formatAssignmentRole(dto.role)})`,
        referenceNo: wr.referenceNo, userId: dto.userId, workRequestId: id,
      });
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.ASSIGNED, actorId: userId, performedById: dto.userId, metadata: { role: dto.role } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.log({
      action: 'ASSIGN',
      entityType: 'WorkRequest',
      entityId: id,
      description: `Assigned user ${dto.userId} as ${dto.role}`,
      performedById: userId,
    });

    if (assignedNotification) this.notificationsService.emit(assignedNotification, dto.userId);

    await this.notifyRequester(wr, {
      title: 'Work request assigned',
      message: `Your work request ${wr.referenceNo} has been assigned to a team.`,
    });
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

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

    let unassignedNotification: { id: string } | undefined;
    await this.prisma.$transaction(async tx => {
      const changed = await tx.workRequestAssignment.updateMany({ where: { id: assignmentId, workRequestId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Assignment changed concurrently.');
      unassignedNotification = await this.notificationsService.createInTransaction(tx, {
        type: 'WORK_REQUEST_UNASSIGNED', title: 'Work Assignment Removed',
        message: `${wr.referenceNo}: you have been removed from this work request.`, referenceNo: wr.referenceNo,
        userId: assignment.userId, workRequestId: id,
      });
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

    if (unassignedNotification) this.notificationsService.emit(unassignedNotification, assignment.userId);
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

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
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.PROGRESS_UPDATED, actorId: userId, performedById: userId, metadata: { progressPercent, note } });
    });

    await this.notifyRequester(wr, {
      title: 'Progress updated',
      message: `Work request ${wr.referenceNo} is now ${progressPercent}% complete.`,
    });
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

    return this.findOne(id);
  }

  /** The sole state-changing completion pipeline. Provenance is explicit: the
   * actor recorded the event; performedBy physically did the work. */
  private async completeAuthoritatively(id: string, actorId: string, performedById: string, input: {
    startedAt?: Date; completedAt: Date; completionDetails?: object; comments?: string;
    outcome?: CompletionOutcome; onBehalfReason?: string; reasonNotes?: string;
  }) {
    const result = await this.prisma.$transaction(async tx => {
      const wr = await tx.workRequest.findUnique({ where: { id }, include: { accomplishment: true, assignments: true } });
      if (!wr) throw new NotFoundException('Work request not found.');
      if (!([RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] as RequestStatus[]).includes(wr.status)) throw new ConflictException('Work request cannot be completed in its current status.');
      const assignment = wr.assignments.find(a => a.userId === performedById && !a.unassignedAt);
      if (!assignment) throw new ForbiddenException('performedBy must have an active assignment.');
      const startedAt = input.startedAt ?? wr.accomplishment?.dateTimeStarted ?? input.completedAt;
      if (input.completedAt < startedAt) throw new BadRequestException('Completion time cannot be before start time.');
      const outcome = input.outcome ?? CompletionOutcome.RESOLVED;
      if (outcome !== CompletionOutcome.RESOLVED && !input.comments?.trim()) throw new BadRequestException('Completion notes are required for a non-resolved outcome.');
      const changed = await tx.workRequest.updateMany({
        where: { id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } },
        data: { status: RequestStatus.COMPLETED, progressPercent: 100, completedAt: input.completedAt, completionOutcome: outcome, completionRecordedById: actorId, completionPerformedById: performedById },
      });
      if (changed.count !== 1) throw new ConflictException('Work request was completed concurrently.');
      const accomplishmentData = { dateTimeStarted: startedAt, dateTimeCompleted: input.completedAt, completionDetails: input.completionDetails as Prisma.InputJsonValue, comments: input.comments };
      if (wr.accomplishment) await tx.workRequestAccomplishment.update({ where: { id: wr.accomplishment.id }, data: accomplishmentData });
      else await tx.workRequestAccomplishment.create({ data: { workRequestId: id, bgPersonnelId: performedById, ...accomplishmentData } });
      if (wr.maintenanceScheduleId) {
        const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: wr.maintenanceScheduleId } });
        if (!schedule?.isActive) throw new BadRequestException('Maintenance schedule is inactive.');
        const scheduleData: Prisma.MaintenanceScheduleUpdateInput = { lastPerformedAt: input.completedAt };
        if (schedule.basis === 'CALENDAR') {
          if (!schedule.frequencyDays) throw new BadRequestException('Maintenance schedule is missing frequencyDays.');
          scheduleData.nextDueAt = new Date(input.completedAt.getTime() + schedule.frequencyDays * 86_400_000);
        } else {
          if (!schedule.frequencyHours || !wr.maintenanceCycleKey?.startsWith('runtime:')) throw new BadRequestException('Maintenance runtime cycle is invalid.');
          scheduleData.nextDueAtHours = new Prisma.Decimal(wr.maintenanceCycleKey.slice('runtime:'.length)).plus(schedule.frequencyHours);
        }
        await tx.maintenanceSchedule.update({ where: { id: schedule.id }, data: scheduleData });
        await this.auditLogService.log({ action: 'ADVANCE_FROM_WORK_REQUEST', entityType: 'MaintenanceSchedule', entityId: schedule.id, description: `Advanced from completed maintenance work request ${wr.referenceNo}`, performedById: actorId }, tx);
      }
      const onBehalf = actorId !== performedById;
      await this.activity(tx, { workRequestId: id, type: onBehalf ? WorkRequestActivityType.COMPLETED_ON_BEHALF : WorkRequestActivityType.COMPLETED, actorId, performedById, occurredAt: input.completedAt, metadata: { outcome, reason: input.onBehalfReason, reasonNotes: input.reasonNotes, recordedAt: new Date().toISOString() } });
      await this.auditLogService.log({ action: onBehalf ? 'COMPLETE_ON_BEHALF' : 'COMPLETE', entityType: 'WorkRequest', entityId: id, description: `Work request ${wr.referenceNo} completed`, metadata: { actorId, performedById, actualCompletedAt: input.completedAt.toISOString(), reason: input.onBehalfReason, reasonNotes: input.reasonNotes, outcome }, performedById: actorId }, tx);
      return { id: wr.id, referenceNo: wr.referenceNo, maintenanceScheduleId: wr.maintenanceScheduleId, requestedById: wr.requestedById };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.notifyRequester(result, { type: 'WORK_REQUEST_COMPLETED', title: 'Work request completed', message: `Your work request ${result.referenceNo} has been completed.` });
    this.emitWorkRequestUpdated(id, result.maintenanceScheduleId);
    return this.findOne(id);
  }

  async progressOnBehalf(id: string, actorId: string, dto: ProgressOnBehalfDto) {
    if (dto.reason === 'OTHER' && !dto.reasonNotes?.trim()) throw new BadRequestException('reasonNotes is required when reason is OTHER.');
    const occurredAt = new Date(dto.actualOccurredAt);
    const wr = await this.prisma.$transaction(async tx => {
      await this.authorizePrivilegedActor(tx, actorId);
      const current = await tx.workRequest.findUnique({ where: { id }, select: { id: true, status: true, referenceNo: true, maintenanceScheduleId: true, requestedById: true } });
      if (!current) throw new NotFoundException('Work request not found.');
      if (!([RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] as RequestStatus[]).includes(current.status)) throw new ConflictException('Cannot update progress in the current status.');
      const assignment = await tx.workRequestAssignment.findFirst({ where: { workRequestId: id, userId: dto.performedByUserId, unassignedAt: null } });
      if (!assignment) throw new BadRequestException('performedBy must be actively assigned.');
      const changed = await tx.workRequest.updateMany({ where: { id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } }, data: { progressPercent: dto.progressPercent, ...(dto.progressPercent > 0 && { status: RequestStatus.IN_PROGRESS }) } });
      if (changed.count !== 1) throw new ConflictException('Work request state changed concurrently.');
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.PROGRESS_RECORDED_ON_BEHALF, actorId, performedById: dto.performedByUserId, occurredAt, metadata: { progressPercent: dto.progressPercent, note: dto.note, reason: dto.reason, reasonNotes: dto.reasonNotes, recordedAt: new Date().toISOString() } });
      await this.auditLogService.log({ action: 'PROGRESS_ON_BEHALF', entityType: 'WorkRequest', entityId: id, description: `Progress recorded on behalf at ${dto.progressPercent}%`, metadata: { actorId, performedById: dto.performedByUserId, actualOccurredAt: occurredAt.toISOString(), reason: dto.reason, reasonNotes: dto.reasonNotes }, performedById: actorId }, tx);
      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.notifyRequester(wr, { title: 'Progress updated', message: `Work request ${wr.referenceNo} is now ${dto.progressPercent}% complete.` });
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);
    return this.findOne(id);
  }

  async completeOnBehalf(id: string, actorId: string, dto: CompleteOnBehalfDto) {
    if (dto.reason === 'OTHER' && !dto.reasonNotes?.trim()) throw new BadRequestException('reasonNotes is required when reason is OTHER.');
    await this.prisma.$transaction(tx => this.authorizePrivilegedActor(tx, actorId));
    return this.completeAuthoritatively(id, actorId, dto.performedByUserId, { startedAt: dto.dateTimeStarted ? new Date(dto.dateTimeStarted) : undefined, completedAt: new Date(dto.actualCompletedAt), completionDetails: dto.completionDetails, comments: dto.comments, outcome: dto.outcome, onBehalfReason: dto.reason, reasonNotes: dto.reasonNotes });
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
      if (wr.assignments.some(assignment => !assignment.unassignedAt && assignment.userId === userId)) {
        throw new ConflictException('Work request has already been completed.');
      }
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

      this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

      return this.findOne(id);
    }

    // ---------- 2. Staff completion (first time) ----------
    // Authorization remains specific to the authenticated worker, while the
    // mutation itself shares the same authoritative pipeline as on-behalf entry.
    await this.prisma.$transaction(tx => this.authorizeOperationalActor(tx, id, userId, userRole));
    return this.completeAuthoritatively(id, userId, userId, {
      startedAt: dto.dateTimeStarted ? new Date(dto.dateTimeStarted) : undefined,
      completedAt: dto.dateTimeCompleted ? new Date(dto.dateTimeCompleted) : new Date(),
      completionDetails: dto.completionDetails as object,
      comments: dto.comments,
      outcome: dto.outcome ?? (dto.cannotBeRepaired ? CompletionOutcome.UNABLE_TO_REPAIR : CompletionOutcome.RESOLVED),
    });

    /* legacy completion implementation retained below temporarily for source
       history; unreachable after the shared pipeline return. */
    /*
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

      // A maintenance-generated work request is the sole authoritative
      // completion event for its schedule.  The conditional work-request
      // state claim above makes this advancement happen at most once.
      if (wr.maintenanceScheduleId && !cannotBeRepaired) {
        const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: wr.maintenanceScheduleId } });
        if (!schedule?.isActive) throw new BadRequestException('Maintenance schedule is inactive.');
        const scheduleData: Prisma.MaintenanceScheduleUpdateInput = { lastPerformedAt: completedAt };
        if (schedule.basis === 'CALENDAR') {
          if (!schedule.frequencyDays) throw new BadRequestException('Maintenance schedule is missing frequencyDays.');
          // Preserve the existing schedule.complete policy: actual completion date.
          scheduleData.nextDueAt = new Date(completedAt.getTime() + schedule.frequencyDays * 86_400_000);
        } else {
          if (!schedule.frequencyHours || !wr.maintenanceCycleKey?.startsWith('runtime:')) throw new BadRequestException('Maintenance runtime cycle is invalid.');
          const completedThreshold = new Prisma.Decimal(wr.maintenanceCycleKey.slice('runtime:'.length));
          scheduleData.nextDueAtHours = completedThreshold.plus(schedule.frequencyHours);
        }
        await tx.maintenanceSchedule.update({ where: { id: schedule.id }, data: scheduleData });
        await this.auditLogService.log({ action: 'ADVANCE_FROM_WORK_REQUEST', entityType: 'MaintenanceSchedule', entityId: schedule.id, description: `Advanced from completed maintenance work request ${wr.referenceNo}`, performedById: userId }, tx);
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
      await this.notifyRequester(wr, {
        type: 'WORK_REQUEST_CANCELLED',
        title: 'Work request cancelled',
        message: `Work request ${wr.referenceNo} has been cancelled because the item cannot be repaired.`,
      });
    } else {
      await this.notifyRequester(wr, {
        type: 'WORK_REQUEST_COMPLETED',
        title: 'Work request completed',
        message: `Your work request ${wr.referenceNo} has been completed.`,
      });
    }

    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

    return updated;
    */
  }

  async reassign(id: string, actorId: string, dto: ReassignWorkRequestDto) {
    if (dto.reason === 'OTHER' && !dto.reasonNotes?.trim()) throw new BadRequestException('reasonNotes is required when reason is OTHER.');
    const result = await this.prisma.$transaction(async tx => {
      await this.authorizePrivilegedActor(tx, actorId);
      const wr = await tx.workRequest.findUnique({ where: { id }, include: { assignments: true } });
      if (!wr) throw new NotFoundException('Work request not found.');
      if (!([RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS, RequestStatus.ON_HOLD] as RequestStatus[]).includes(wr.status)) throw new ConflictException('Work request cannot be reassigned in its current status.');
      const old = wr.assignments.find(a => a.id === dto.assignmentId && !a.unassignedAt);
      if (!old) throw new BadRequestException('An active assignment is required for reassignment.');
      const replacement = await tx.user.findFirst({ where: { id: dto.userId, isActive: true, role: { code: 'CAMPUS_STAFF', isActive: true }, position: { is: { isActive: true } } }, select: { id: true } });
      if (!replacement) throw new BadRequestException('Replacement must be an active eligible CAMPUS_STAFF user.');
      if (replacement.id === old.userId) throw new BadRequestException('Replacement must differ from the current assignee.');
      const removed = await tx.workRequestAssignment.updateMany({ where: { id: old.id, unassignedAt: null }, data: { unassignedAt: new Date(), unassignedById: actorId, reassignmentReason: dto.reason, reassignmentReasonNotes: dto.reasonNotes } });
      if (removed.count !== 1) throw new ConflictException('Assignment changed concurrently.');
      await tx.workRequestAssignment.create({ data: { workRequestId: id, userId: replacement.id, role: old.role } });
      const notification = await this.notificationsService.createInTransaction(tx, { type: 'WORK_REQUEST_ASSIGNED', title: 'New Work Assignment', message: `${wr.referenceNo}: you have been assigned to this work request.`, userId: replacement.id, workRequestId: id, referenceNo: wr.referenceNo });
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.REASSIGNED, actorId, metadata: { previousAssigneeId: old.userId, newAssigneeId: replacement.id, reason: dto.reason, reasonNotes: dto.reasonNotes } });
      await this.auditLogService.log({ action: 'REASSIGN', entityType: 'WorkRequest', entityId: id, description: `Reassigned work request ${wr.referenceNo}`, metadata: { previousAssigneeId: old.userId, newAssigneeId: replacement.id, reason: dto.reason, reasonNotes: dto.reasonNotes }, performedById: actorId }, tx);
      return { wr, notification, replacementId: replacement.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.notificationsService.emit(result.notification, result.replacementId);
    this.emitWorkRequestUpdated(id, result.wr.maintenanceScheduleId);
    return this.findOne(id);
  }

  async acknowledge(id: string, assignmentId: string, userId: string) {
    const changed = await this.prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
      if (!actor?.isActive || !actor.role.isActive || actor.role.code !== 'CAMPUS_STAFF') {
        throw new ForbiddenException('Only an active assigned CAMPUS_STAFF worker may acknowledge an assignment.');
      }
      const assignment = await tx.workRequestAssignment.updateMany({ where: { id: assignmentId, workRequestId: id, userId, unassignedAt: null, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
      if (!assignment.count) throw new ConflictException('Active unacknowledged assignment not found.');
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.WORKER_ACKNOWLEDGED, actorId: userId, performedById: userId });
      await this.auditLogService.log({ action: 'WORKER_ACKNOWLEDGED', entityType: 'WorkRequest', entityId: id, description: 'Worker acknowledged assignment.', performedById: userId }, tx);
      return true;
    });
    if (changed) this.emitWorkRequestUpdated(id);
    return this.findOne(id);
  }

  async manuallyInform(id: string, assignmentId: string, actorId: string, dto: ManualInformDto) {
    await this.prisma.$transaction(async tx => {
      await this.authorizePrivilegedActor(tx, actorId);
      const changed = await tx.workRequestAssignment.updateMany({ where: { id: assignmentId, workRequestId: id, unassignedAt: null }, data: { manuallyInformedAt: new Date(), manuallyInformedById: actorId, communicationMethod: dto.communicationMethod } });
      if (!changed.count) throw new ConflictException('Active assignment not found.');
      const assignment = await tx.workRequestAssignment.findUnique({ where: { id: assignmentId }, select: { userId: true } });
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.WORKER_INFORMED_MANUALLY, actorId, performedById: assignment!.userId, metadata: { communicationMethod: dto.communicationMethod } });
      await this.auditLogService.log({ action: 'MANUALLY_INFORM_WORKER', entityType: 'WorkRequest', entityId: id, description: 'Worker manually informed of assignment.', metadata: { assignmentId, communicationMethod: dto.communicationMethod }, performedById: actorId }, tx);
    });
    this.emitWorkRequestUpdated(id);
    return this.findOne(id);
  }

  async hold(id: string, actorId: string, role: string, dto: HoldWorkRequestDto) {
    if (dto.reason === HoldReason.OTHER && !dto.notes?.trim()) throw new BadRequestException('notes are required when reason is OTHER.');
    await this.prisma.$transaction(async tx => {
      await this.authorizeOperationalActor(tx, id, actorId, role);
      const changed = await tx.workRequest.updateMany({ where: { id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } }, data: { status: RequestStatus.ON_HOLD } });
      if (!changed.count) throw new ConflictException('Only assigned or in-progress work can be placed on hold.');
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.PLACED_ON_HOLD, actorId, metadata: { reason: dto.reason, notes: dto.notes, heldAt: new Date().toISOString() } });
      await this.auditLogService.log({ action: 'PLACE_ON_HOLD', entityType: 'WorkRequest', entityId: id, description: 'Work request placed on hold.', metadata: { reason: dto.reason, notes: dto.notes }, performedById: actorId }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.emitWorkRequestUpdated(id); return this.findOne(id);
  }

  async resume(id: string, actorId: string, role: string) {
    await this.prisma.$transaction(async tx => {
      await this.authorizeOperationalActor(tx, id, actorId, role);
      const changed = await tx.workRequest.updateMany({ where: { id, status: RequestStatus.ON_HOLD }, data: { status: RequestStatus.IN_PROGRESS } });
      if (!changed.count) throw new ConflictException('Only on-hold work can be resumed.');
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.RESUMED, actorId, metadata: { resumedAt: new Date().toISOString() } });
      await this.auditLogService.log({ action: 'RESUME', entityType: 'WorkRequest', entityId: id, description: 'Work request resumed.', performedById: actorId }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.emitWorkRequestUpdated(id); return this.findOne(id);
  }

  async requestClarification(id: string, actorId: string, dto: ClarificationDto) {
    const result = await this.prisma.$transaction(async tx => {
      await this.authorizePrivilegedActor(tx, actorId);
      const wr = await tx.workRequest.findUnique({ where: { id }, select: { id: true, status: true, requestedById: true, referenceNo: true, maintenanceScheduleId: true } });
      if (!wr) throw new NotFoundException('Work request not found.');
      if (!wr.requestedById) throw new ConflictException('Clarification cannot be requested for a walk-in work request without an authenticated requester.');
      if (wr.status !== RequestStatus.PENDING) throw new ConflictException('Clarification can only be requested while pending review.');
      await tx.workRequest.update({ where: { id }, data: { clarificationStatus: ClarificationStatus.REQUESTED } });
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.CLARIFICATION_REQUESTED, actorId, metadata: { message: dto.message } });
      await this.auditLogService.log({ action: 'REQUEST_CLARIFICATION', entityType: 'WorkRequest', entityId: id, description: 'Requested work request clarification.', metadata: { message: dto.message }, performedById: actorId }, tx);
      const notification = wr.requestedById ? await this.notificationsService.createInTransaction(tx, { type: 'WORK_REQUEST_CLARIFICATION_REQUESTED', title: 'Clarification requested', message: `${wr.referenceNo}: ${dto.message}`, userId: wr.requestedById, workRequestId: id, referenceNo: wr.referenceNo }) : null;
      return { wr, notification };
    });
    if (result.notification && result.wr.requestedById) this.notificationsService.emit(result.notification, result.wr.requestedById);
    this.emitWorkRequestUpdated(id, result.wr.maintenanceScheduleId); return this.findOne(id);
  }

  async respondClarification(id: string, actorId: string, dto: ClarificationDto) {
    const scope = await this.readScopeForUser(actorId);
    const result = await this.prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: { select: { code: true } } } });
      if (!actor || !['FACULTY', 'PROPERTY_CUSTODIAN'].includes(actor.role.code)) {
        throw new ForbiddenException('Only the authenticated requester or an authorized office requester may respond to clarification.');
      }
      const wr = await tx.workRequest.findFirst({ where: { id, ...scope }, select: { id: true, clarificationStatus: true, referenceNo: true, maintenanceScheduleId: true } });
      if (!wr) throw new NotFoundException('Work request not found.');
      if (wr.clarificationStatus !== ClarificationStatus.REQUESTED) throw new ConflictException('No clarification is awaiting a response.');
      await tx.workRequest.update({ where: { id }, data: { clarificationStatus: ClarificationStatus.RESPONDED } });
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.CLARIFICATION_RESPONDED, actorId, metadata: { response: dto.message } });
      await this.auditLogService.log({ action: 'RESPOND_CLARIFICATION', entityType: 'WorkRequest', entityId: id, description: 'Responded to work request clarification.', performedById: actorId }, tx);
      const officers = await tx.user.findMany({ where: { isActive: true, role: { code: { in: PRIVILEGED_ROLES }, isActive: true } }, select: { id: true } });
      const notifications = await Promise.all(officers.map(user => this.notificationsService.createInTransaction(tx, { type: 'WORK_REQUEST_CLARIFICATION_RESPONDED', title: 'Clarification received', message: `${wr.referenceNo}: requester clarification received.`, userId: user.id, workRequestId: id, referenceNo: wr.referenceNo })));
      return { wr, notifications, officers };
    });
    result.notifications.forEach((notification, index) => this.notificationsService.emit(notification, result.officers[index].id));
    this.emitWorkRequestUpdated(id, result.wr.maintenanceScheduleId); return this.findOne(id);
  }

  async reopen(id: string, actorId: string, dto: ReopenWorkRequestDto) {
    const result = await this.prisma.$transaction(async tx => {
      await this.authorizePrivilegedActor(tx, actorId);
      const wr = await tx.workRequest.findUnique({ where: { id }, select: { id: true, status: true, maintenanceScheduleId: true, referenceNo: true, completedAt: true, completionOutcome: true } });
      if (!wr) throw new NotFoundException('Work request not found.');
      if (wr.maintenanceScheduleId) throw new ConflictException('Completed maintenance-generated work requests cannot be reopened because schedule recurrence has advanced.');
      const changed = await tx.workRequest.updateMany({ where: { id, status: RequestStatus.COMPLETED }, data: { status: RequestStatus.IN_PROGRESS, progressPercent: 100, isActive: true } });
      if (!changed.count) throw new ConflictException('Only completed work requests can be reopened.');
      await this.activity(tx, { workRequestId: id, type: WorkRequestActivityType.REOPENED, actorId, metadata: { reason: dto.reason, previousCompletedAt: wr.completedAt?.toISOString(), previousOutcome: wr.completionOutcome } });
      await this.auditLogService.log({ action: 'REOPEN', entityType: 'WorkRequest', entityId: id, description: `Reopened work request ${wr.referenceNo}`, metadata: { reason: dto.reason, previousCompletedAt: wr.completedAt?.toISOString(), previousOutcome: wr.completionOutcome }, performedById: actorId }, tx);
      return wr;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.emitWorkRequestUpdated(id, result.maintenanceScheduleId); return this.findOne(id);
  }

  async cancel(id: string, userId: string) {
    const wr = await this.findOne(id);
    if (wr.status === RequestStatus.COMPLETED || wr.status === RequestStatus.CANCELLED) {
      throw new BadRequestException('Work request cannot be cancelled.');
    }

    let notifications: { id: string; userId: string }[] = [];
    await this.prisma.$transaction(async tx => {
      const changed = await tx.workRequest.updateMany({ where: { id, status: { in: [RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } }, data: { status: RequestStatus.CANCELLED, isActive: false } });
      if (changed.count !== 1) throw new ConflictException('Work request was cancelled concurrently.');
      const recipients = new Set([
        ...(wr.requestedById ? [wr.requestedById] : []),
        ...wr.assignments.filter(a => !a.unassignedAt).map(a => a.userId),
      ]);
      notifications = await Promise.all([...recipients].map(recipientId => this.notificationsService.createInTransaction(tx, {
        type: 'WORK_REQUEST_CANCELLED', referenceNo: wr.referenceNo, title: 'Work request cancelled',
        message: `Work request ${wr.referenceNo} has been cancelled.`, userId: recipientId, workRequestId: id,
      })));
      await this.auditLogService.log({ action: 'CANCEL', entityType: 'WorkRequest', entityId: id, description: `Work request ${wr.referenceNo} cancelled`, performedById: userId }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    for (const notification of notifications) this.notificationsService.emit(notification, notification.userId);
    this.emitWorkRequestUpdated(id, wr.maintenanceScheduleId);

    return { message: 'Work request cancelled.' };
  }
}
