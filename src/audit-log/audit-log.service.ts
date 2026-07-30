// src/audit-log/audit-log.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId: string;
    description?: string;
    metadata?: Record<string, any>;
    performedById: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
        metadata: params.metadata,
        performedById: params.performedById,
      },
    });
  }

  async findAll(entityType?: string, entityId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: true },
      take: 200,
    });
  }
}