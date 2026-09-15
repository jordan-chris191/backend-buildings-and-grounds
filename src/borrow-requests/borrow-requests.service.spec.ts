import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { BorrowRequestStatus, Prisma, TransactionType } from '@prisma/client';
import { BorrowRequestsService } from './borrow-requests.service';

describe('BorrowRequestsService Phase 1 invariants', () => {
  const request: any = {
    id: 'borrow-1',
    requestedById: 'borrower-1',
    inventoryItemId: 'item-1',
    quantity: new Prisma.Decimal(8),
    status: BorrowRequestStatus.PENDING,
    dueDate: null,
    transaction: null,
    inventoryItem: { name: 'Generator' },
  };
  const tx: any = {
    borrowRequest: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    inventoryItem: { update: jest.fn() },
    itemTransaction: { create: jest.fn() },
    sequenceCounter: { upsert: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
  const audit: any = { log: jest.fn() };
  const gateway: any = { notifyUser: jest.fn() };
  const notifications: any = { create: jest.fn() };
  const ledger: any = { apply: jest.fn() };
  const service = new BorrowRequestsService(
    prisma,
    audit,
    gateway,
    notifications,
    ledger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.borrowRequest.findUnique.mockResolvedValue(request);
    tx.borrowRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: BorrowRequestStatus.RETURNED,
    });
    tx.borrowRequest.update.mockResolvedValue({});
    tx.borrowRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.update.mockResolvedValue({});
    tx.itemTransaction.create.mockResolvedValue({ id: 'transaction-1' });
    tx.sequenceCounter.upsert.mockResolvedValue({ count: 1 });
    ledger.apply.mockResolvedValue({});
    notifications.create.mockResolvedValue({});
  });

  it('does not create issue side effects if a competing approval already claimed the request', async () => {
    tx.borrowRequest.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.approve('borrow-1', 'admin-1', {} as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ledger.apply).not.toHaveBeenCalled();
    expect(tx.itemTransaction.create).not.toHaveBeenCalled();
  });

  it('allows only one mocked concurrent approval claim to create issuance side effects', async () => {
    tx.borrowRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.borrowRequest.findUnique.mockResolvedValue({
      ...request,
      inventoryItem: { name: 'Generator' },
    });
    const attempts = await Promise.allSettled([
      service.approve('borrow-1', 'admin-1', {
        transactionType: TransactionType.ISSUANCE,
      }),
      service.approve('borrow-1', 'admin-2', {
        transactionType: TransactionType.ISSUANCE,
      }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(ledger.apply).toHaveBeenCalledTimes(1);
    expect(tx.itemTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('allows the borrower to return their own approved issuance', async () => {
    const approved = {
      ...request,
      status: BorrowRequestStatus.APPROVED,
      transaction: { transactionType: TransactionType.ISSUANCE },
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(approved);

    await service.markReturned('borrow-1', 'borrower-1', 'Personnel');

    expect(ledger.apply).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quantityChange: new Prisma.Decimal(8),
      }),
    );
    expect(tx.borrowRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: BorrowRequestStatus.APPROVED,
        }),
      }),
    );
  });

  it('rejects a return by an unrelated authenticated user', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({
        ...request,
        status: BorrowRequestStatus.APPROVED,
      } as any);
    await expect(
      service.markReturned('borrow-1', 'other-user', 'Personnel'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('permits established privileged roles to return another user’s approved request', async () => {
    const approved = {
      ...request,
      status: BorrowRequestStatus.APPROVED,
      transaction: { transactionType: TransactionType.WITHDRAWAL },
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(approved);

    await service.markReturned('borrow-1', 'custodian-1', 'Property Custodian');
    expect(tx.borrowRequest.updateMany).toHaveBeenCalled();
  });

  it('rejects an already-returned request', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({
        ...request,
        status: BorrowRequestStatus.RETURNED,
      } as any);
    await expect(
      service.markReturned('borrow-1', 'borrower-1', 'Personnel'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
