import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService ownership and delivery', () => {
  const prisma: any = { notification: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() } };
  const gateway: any = { notifyNewNotification: jest.fn() };
  const service = new NotificationsService(prisma, gateway);
  beforeEach(() => jest.resetAllMocks());

  it('cannot mark another user notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue({ id: 'n', userId: 'owner' });
    await expect(service.markAsRead('n', 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emits only after a notification object is supplied after commit', () => {
    service.emit({ id: 'n', type: 'WORK_REQUEST_ASSIGNED' }, 'worker');
    expect(gateway.notifyNewNotification).toHaveBeenCalledWith('worker', expect.objectContaining({ id: 'n' }));
  });
});
