import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService ownership and delivery', () => {
  const prisma: any = { notification: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn() }, $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)) };
  const gateway: any = { notifyNewNotification: jest.fn() };
  const service = new NotificationsService(prisma, gateway);
  beforeEach(() => { jest.resetAllMocks(); prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)); });

  it('cannot mark another user notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue({ id: 'n', userId: 'owner' });
    await expect(service.markAsRead('n', 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emits only after a notification object is supplied after commit', () => {
    service.emit({ id: 'n', type: 'WORK_REQUEST_ASSIGNED' }, 'worker');
    expect(gateway.notifyNewNotification).toHaveBeenCalledWith('worker', expect.objectContaining({ id: 'n' }));
  });

  it('paginates only the current user notifications and leaves unread counting independent', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'n2', userId: 'owner' }]);
    prisma.notification.count.mockResolvedValueOnce(11).mockResolvedValueOnce(7);
    await expect(service.findMine('owner', 2, 10)).resolves.toEqual({ data: [{ id: 'n2', userId: 'owner' }], meta: { page: 2, limit: 10, total: 11, totalPages: 2 } });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({ where: { userId: 'owner' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 10, take: 10 });
    await expect(service.unreadCount('owner')).resolves.toEqual({ count: 7 });
    expect(prisma.notification.count).toHaveBeenLastCalledWith({ where: { userId: 'owner', isRead: false } });
  });
});
