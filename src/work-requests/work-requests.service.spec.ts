import { ForbiddenException } from '@nestjs/common';
import { WorkRequestsService } from './work-requests.service';

describe('WorkRequestsService authorization invariants', () => {
  const tx: any = { user: { findUnique: jest.fn() }, workRequestAssignment: { findFirst: jest.fn() } };
  const service = new WorkRequestsService({} as any, {} as any, {} as any);
  beforeEach(() => jest.resetAllMocks());

  it('prevents a normal requester from impersonating another requester', async () => {
    tx.user.findUnique.mockResolvedValueOnce({ id: 'actor', isActive: true, role: { name: 'Office' } });
    await expect((service as any).requesterForCreate(tx, 'actor', 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an active assignment for an operational progress actor', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'staff', isActive: true, role: { name: 'Campus Staff' } });
    tx.workRequestAssignment.findFirst.mockResolvedValue(null);
    await expect((service as any).authorizeOperationalActor(tx, 'wr', 'staff')).rejects.toBeInstanceOf(ForbiddenException);
    tx.workRequestAssignment.findFirst.mockResolvedValue({ id: 'assignment' });
    await expect((service as any).authorizeOperationalActor(tx, 'wr', 'staff')).resolves.toBeUndefined();
  });
});
