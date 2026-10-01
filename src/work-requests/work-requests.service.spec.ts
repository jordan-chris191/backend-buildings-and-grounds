import { ForbiddenException } from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';

describe('WorkRequestsService authorization invariants', () => {
  const tx: any = { user: { findUnique: jest.fn() }, workRequestAssignment: { findFirst: jest.fn() } };
  const prisma: any = {
    user: { findUnique: jest.fn() },
    workRequest: { findMany: jest.fn(), count: jest.fn() },
    workRequestAccomplishment: { count: jest.fn(), aggregate: jest.fn() },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
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

  it('enforces privileged actor authorization inside lifecycle services, not only controllers', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'faculty', isActive: true, role: { code: 'FACULTY', isActive: true } });
    await expect((service as any).authorizePrivilegedActor(tx, 'faculty')).rejects.toBeInstanceOf(ForbiddenException);
    tx.user.findUnique.mockResolvedValue({ id: 'officer', isActive: true, role: { code: 'BUILDING_GROUNDS_OFFICER', isActive: true } });
    await expect((service as any).authorizePrivilegedActor(tx, 'officer')).resolves.toBeUndefined();
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
    await expect(service.findAllForUser('staff', 'PENDING' as any, undefined, undefined, 'staff', false, 2, 10)).resolves.toEqual({ data: [{ id: 'wr-2' }], meta: { page: 2, limit: 10, total: 11, totalPages: 2 } });
    const where = expect.objectContaining({ status: 'PENDING', isActive: true, assignments: { some: { userId: 'staff', unassignedAt: null } } });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
  });

  it('applies source before pagination and uses the same scoped where for data and metadata', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'officer', isActive: true, role: { code: 'BUILDING_GROUNDS_OFFICER', isActive: true } });
    prisma.workRequest.findMany.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({ id: `walk-in-${index}`, source: 'WALK_IN' })));
    prisma.workRequest.count.mockResolvedValue(6);

    await expect(service.findAllForUser('officer', 'PENDING' as any, 'WALK_IN' as any, undefined, undefined, false, 1, 5)).resolves.toEqual({
      data: Array.from({ length: 5 }, (_, index) => ({ id: `walk-in-${index}`, source: 'WALK_IN' })),
      meta: { page: 1, limit: 5, total: 6, totalPages: 2 },
    });

    const where = expect.objectContaining({ isActive: true, status: 'PENDING', source: 'WALK_IN' });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 0, take: 5 }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
  });

  it('paginates the source-filtered result set rather than filtering a page in memory', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'officer', isActive: true, role: { code: 'BUILDING_GROUNDS_OFFICER', isActive: true } });
    prisma.workRequest.findMany.mockResolvedValue([{ id: 'walk-in-6', source: 'WALK_IN' }]);
    prisma.workRequest.count.mockResolvedValue(6);

    await expect(service.findAllForUser('officer', undefined, 'WALK_IN' as any, undefined, undefined, false, 2, 5)).resolves.toEqual({
      data: [{ id: 'walk-in-6', source: 'WALK_IN' }],
      meta: { page: 2, limit: 5, total: 6, totalPages: 2 },
    });

    const where = expect.objectContaining({ isActive: true, source: 'WALK_IN' });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 5, take: 5 }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
  });

  it('keeps source filtering inside the existing campus staff authorization scope', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { code: 'CAMPUS_STAFF', isActive: true } });
    prisma.workRequest.findMany.mockResolvedValue([]);
    prisma.workRequest.count.mockResolvedValue(0);

    await service.findAllForUser('staff', undefined, 'ONLINE' as any, undefined, undefined, false, 1, 10);

    const where = expect.objectContaining({
      isActive: true,
      source: 'ONLINE',
      assignments: { some: { userId: 'staff', unassignedAt: null } },
    });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
  });

  it('composes source with status, campus, assigned-to-me, inactive, and paging filters', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { code: 'CAMPUS_STAFF', isActive: true } });
    prisma.workRequest.findMany.mockResolvedValue([]);
    prisma.workRequest.count.mockResolvedValue(0);

    await service.findAllForUser('staff', 'PENDING' as any, 'WALK_IN' as any, 'MC1' as any, 'staff', true, 2, 5);

    const where = expect.objectContaining({
      status: 'PENDING',
      source: 'WALK_IN',
      campus: 'MC1',
      assignments: { some: { userId: 'staff', unassignedAt: null } },
    });
    expect(prisma.workRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 5, take: 5 }));
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where });
    expect(prisma.workRequest.findMany.mock.calls.at(-1)[0].where).not.toHaveProperty('isActive');
  });

  it('returns scoped dashboard and rating statistics independently of pagination', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { code: 'CAMPUS_STAFF', isActive: true } });
    prisma.workRequest.count
      .mockResolvedValueOnce(4).mockResolvedValueOnce(3).mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5).mockResolvedValueOnce(1).mockResolvedValueOnce(6).mockResolvedValueOnce(15);
    prisma.workRequestAccomplishment.count.mockResolvedValue(2);
    prisma.workRequestAccomplishment.aggregate
      .mockResolvedValueOnce({ _count: { serviceRating: 10 }, _avg: { serviceRating: 4.1 } })
      .mockResolvedValueOnce({ _count: { expectationRating: 0 }, _avg: { expectationRating: null } });

    await expect(service.statsForUser('staff')).resolves.toEqual({
      pendingApproval: 4, needsAssignment: 3, assigned: 2, inProgress: 5, onHold: 1,
      completedThisMonth: 6, totalActive: 15, ratedRequests: 2, ratingResponses: 10, averageRating: 4.1,
    });
    const scopedWorkRequest = expect.objectContaining({
      isActive: true,
      assignments: { some: { userId: 'staff', unassignedAt: null } },
    });
    expect(prisma.workRequest.count).toHaveBeenCalledWith({ where: expect.objectContaining({ AND: expect.arrayContaining([scopedWorkRequest]) }) });
    expect(prisma.workRequestAccomplishment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workRequest: scopedWorkRequest,
        OR: [{ serviceRating: { gte: 1, lte: 5 } }, { expectationRating: { gte: 1, lte: 5 } }],
      }),
    });
  });

  it('counts a rated work request once while counting each valid rating value', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin', isActive: true, role: { code: 'ADMINISTRATOR', isActive: true } });
    prisma.workRequest.count.mockResolvedValue(0);
    prisma.workRequestAccomplishment.count.mockResolvedValue(1);
    prisma.workRequestAccomplishment.aggregate
      .mockResolvedValueOnce({ _count: { serviceRating: 1 }, _avg: { serviceRating: 5 } })
      .mockResolvedValueOnce({ _count: { expectationRating: 1 }, _avg: { expectationRating: 4 } });

    await expect(service.statsForUser('admin')).resolves.toMatchObject({
      ratedRequests: 1,
      ratingResponses: 2,
      averageRating: 4.5,
    });
  });

  it('returns null average when no valid persisted ratings exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin', isActive: true, role: { code: 'ADMINISTRATOR', isActive: true } });
    prisma.workRequest.count.mockResolvedValue(0);
    prisma.workRequestAccomplishment.count.mockResolvedValue(0);
    prisma.workRequestAccomplishment.aggregate
      .mockResolvedValueOnce({ _count: { serviceRating: 0 }, _avg: { serviceRating: null } })
      .mockResolvedValueOnce({ _count: { expectationRating: 0 }, _avg: { expectationRating: null } });

    await expect(service.statsForUser('admin')).resolves.toMatchObject({
      ratedRequests: 0,
      ratingResponses: 0,
      averageRating: null,
    });
  });
});
