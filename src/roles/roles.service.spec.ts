import { RolesService } from './roles.service';

describe('RolesService Phase 4 revocation', () => {
  it('invalidates users and refresh sessions when a role is deactivated', async () => {
    const prisma: any = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-1' }), update: jest.fn().mockResolvedValue({ id: 'role-1', isActive: false }) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]), updateMany: jest.fn().mockReturnValue('user-update') },
      refreshToken: { updateMany: jest.fn().mockReturnValue('token-update') },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const gateway = { disconnectUser: jest.fn() };
    const service = new RolesService(prisma, gateway as any);

    await service.remove('role-1');

    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { authVersion: { increment: 1 } } }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(gateway.disconnectUser).toHaveBeenCalledWith('user-1');
  });
});
