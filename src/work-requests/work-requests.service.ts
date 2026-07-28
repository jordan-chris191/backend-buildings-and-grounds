// src/work-requests/work-requests.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { AssignWorkRequestDto } from './dto/assign-work-request.dto';
import { CompleteWorkRequestDto } from './dto/complete-work-request.dto';

@Injectable()
export class WorkRequestsService {
  constructor(private prisma: PrismaService) {}

  private async generateReferenceNo(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.prisma.sequenceCounter.upsert({
      where: { type_year: { type: 'WR', year } },
      update: { count: { increment: 1 } },
      create: { type: 'WR', year, count: 1 },
    });
    return `WR-${year}-${counter.count.toString().padStart(4, '0')}`;
  }

  async create(userId: string, dto: CreateWorkRequestDto) {
    const referenceNo = await this.generateReferenceNo();

    return this.prisma.workRequest.create({
      data: {
        referenceNo,
        requestType: dto.requestType,
        requestingOffice: dto.requestingOffice,
        particulars: dto.particulars,
        details: dto.details,
        inventoryItemId: dto.inventoryItemId,
        requestedById: userId,
      },
    });
  }

  async findAll() {
    return this.prisma.workRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { requestedBy: true, assignedTo: true, assignments: true },
    });
  }

  async findMine(userId: string) {
    return this.prisma.workRequest.findMany({
      where: { requestedById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.workRequest.findUnique({
      where: { id },
      include: {
        requestedBy: true,
        assignedTo: true,
        assignments: { include: { user: true } },
        accomplishment: true,
        inventoryItem: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Work request not found');
    }
    return request;
  }

  async assign(requestId: string, dto: AssignWorkRequestDto) {
    await this.findOne(requestId);

    const [request] = await this.prisma.$transaction([
      this.prisma.workRequest.update({
        where: { id: requestId },
        data: {
          status: 'ASSIGNED',
          assignedToId: dto.userId,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        },
      }),
      this.prisma.workRequestAssignment.upsert({
        where: {
          workRequestId_userId_role: {
            workRequestId: requestId,
            userId: dto.userId,
            role: dto.role,
          },
        },
        update: {},
        create: {
          workRequestId: requestId,
          userId: dto.userId,
          role: dto.role,
        },
      }),
      this.prisma.notification.create({
        data: {
          userId: dto.userId,
          title: 'New task assigned',
          message: `You've been assigned a work request as ${dto.role}`,
          workRequestId: requestId,
        },
      }),
    ]);

    return request;
  }

  async accept(requestId: string, userId: string) {
    const request = await this.findOne(requestId);

    if (request.assignedToId !== userId) {
      throw new ForbiddenException('This task is not assigned to you');
    }

    return this.prisma.workRequest.update({
      where: { id: requestId },
      data: { status: 'IN_PROGRESS' },
    });
  }

  async complete(requestId: string, userId: string, dto: CompleteWorkRequestDto) {
    const request = await this.findOne(requestId);

    if (request.assignedToId !== userId) {
      throw new ForbiddenException('You cannot complete a task not assigned to you');
    }

    const [updatedRequest] = await this.prisma.$transaction([
      this.prisma.workRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED', progressPercent: 100 },
      }),
      this.prisma.workRequestAccomplishment.create({
        data: {
          workRequestId: requestId,
          bgPersonnelId: userId,
          dateTimeStarted: dto.dateTimeStarted ? new Date(dto.dateTimeStarted) : undefined,
          dateTimeCompleted: dto.dateTimeCompleted ? new Date(dto.dateTimeCompleted) : undefined,
          completionDetails: dto.completionDetails,
          serviceRating: dto.serviceRating,
          expectationRating: dto.expectationRating,
          comments: dto.comments,
        },
      }),
      this.prisma.notification.create({
        data: {
          userId: request.requestedById,
          title: 'Your work request is completed',
          message: `Request ${request.referenceNo} has been marked as completed`,
          workRequestId: requestId,
        },
      }),
    ]);

    return updatedRequest;
  }

  async updateProgress(requestId: string, userId: string, progressPercent: number) {
    const request = await this.findOne(requestId);

    if (request.assignedToId !== userId) {
      throw new ForbiddenException('You cannot update progress on a task not assigned to you');
    }

    return this.prisma.workRequest.update({
      where: { id: requestId },
      data: { progressPercent },
    });
  }
}