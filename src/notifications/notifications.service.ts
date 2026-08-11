// src/notifications/notifications.service.ts
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BorrowRequestsGateway,
  ) {}

  /** Create a notification and push it to the user in real time */
  async create(data: {
    title: string;
    message: string;
    userId: string;
    workRequestId?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        userId: data.userId,
        workRequestId: data.workRequestId,
      },
    });

    // Emit the new notification via WebSocket
    this.gateway.notifyNewNotification(data.userId, notification);

    return notification;
  }

  /** Get all notifications for the logged‑in user */
  async findMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Count unread notifications for the badge */
  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /** Mark a single notification as read */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('This notification does not belong to you');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  /** Mark all notifications as read for the user */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'All notifications marked as read' };
  }
}