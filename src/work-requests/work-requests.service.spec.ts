import { ForbiddenException } from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';

describe('WorkRequestsService authorization invariants', () => {
  const tx: any = { user: { findUnique: jest.fn() }, workRequestAssignment: { findFirst: jest.fn() } };
  const prisma: any = { user: { findUnique: jest.fn() } };
  const service = new WorkRequestsService(prisma, {} as any, {} as any);
  beforeEach(() => jest.resetAllMocks());

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
});
