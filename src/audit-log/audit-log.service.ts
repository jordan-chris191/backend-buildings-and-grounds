import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    data: {
      action: string;
      entityType: string;
      entityId: string;
      description?: string;
      metadata?: Record<string, any>;
      performedById: string;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        description: data.description,
        metadata: data.metadata,
        performedById: data.performedById,
      },
    });
  }

  async findAll(entityType?: string, entityId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
      },
      include: {
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
