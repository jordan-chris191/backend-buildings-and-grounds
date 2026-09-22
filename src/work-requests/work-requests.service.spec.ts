import { ForbiddenException } from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';

describe('WorkRequestsService authorization invariants', () => {
  const tx: any = { user: { findUnique: jest.fn() }, workRequestAssignment: { findFirst: jest.fn() } };
  const prisma: any = { user: { findUnique: jest.fn() }, workRequest: { findMany: jest.fn(), count: jest.fn() }, $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)) };
  const service = new WorkRequestsService(prisma, {} as any, {} as any, {} as any);
  beforeEach(() => { jest.resetAllMocks(); prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)); });

  it('prevents a normal requester from impersonating another requester', async () => {
    tx.user.findUnique.mockResolvedValueOnce({ id: 'actor', isActive: true, role: { code: 'FACULTY' } });
    await expect((service as any).requesterForCreate(tx, 'actor', 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an active assignment for an operational progress actor', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { code: 'CAMPUS_STAFF' } });
    tx.workRequestAssignment.findFirst.mockResolvedValue(null);
    await expect((service as any).authorizeOperationalActor(tx, 'wr', 'staff')).rejects.toBeInstanceOf(ForbiddenException);
    tx.workRequestAssignment.findFirst.mockResolvedValue({ id: 'assignment' });
    await expect((service as any).authorizeOperationalActor(tx, 'wr', 'staff')).resolves.toBeUndefined();
  });

  it('limits campus staff reads to their active assignments', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'staff', isActive: true, officeId: 'office-1', role: { code: 'CAMPUS_STAFF', isActive: true },
    });
    await expect((service as any).readScopeForUser('staff')).resolves.toEqual({
      assignments: { some: { userId: 'staff', unassignedAt: null } },
    });
  });

  it('limits office requester reads to their own request or office', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'faculty', isActive: true, officeId: 'office-1', role: { code: 'FACULTY', isActive: true },
    });
    await expect((service as any).readScopeForUser('faculty')).resolves.toEqual({
      OR: [{ requestedById: 'faculty' }, { requestingOfficeId: 'office-1' }],
    });
  });

  it('paginates the same scoped and filtered dataset used for its total', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { code: 'CAMPUS_STAFF', isActive: true } });
    prisma.workRequest.findMany.mockResolvedValue([{ id: 'wr-2' }]);
    prisma.workRequest.count.mockResolvedValue(11);
    await expect(service.findAllForUser('staff', 'PENDING' as any, undefined, 'staff', false, 2, 10)).resolves.toEqual({ data: [{ id: 'wr-2' }], meta: { page: 2, limit: 10, total: 11, totalPages: 2 } });
    const where = expect.objectContaining({ status: 'PENDING', isActive: true, assignments: { some: { userId: 'staff', unassignedAt: null } } });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
  });
});
