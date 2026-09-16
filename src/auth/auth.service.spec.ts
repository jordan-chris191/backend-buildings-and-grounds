import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';

describe('AuthService', () => {
  let service: AuthService;
  const prisma: any = { user: {}, refreshToken: {}, passwordResetToken: {}, $transaction: jest.fn() };
  const jwt = { sign: jest.fn() };
  const email = { sendPasswordResetEmail: jest.fn() };
  const audit = { log: jest.fn() };
  const gateway = { disconnectUser: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: EmailService, useValue: email },
        { provide: AuditLogService, useValue: audit },
        { provide: BorrowRequestsGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejects refresh tokens from an earlier authorization version', async () => {
    prisma.refreshToken.findUnique = jest.fn().mockResolvedValue({
      id: 'refresh-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), authVersion: 0,
      user: { id: 'user-1', isActive: true, authVersion: 1, role: { isActive: true, code: 'CAMPUS_STAFF' } },
    });
    await expect(service.refresh('raw-token')).rejects.toThrow('authorization has changed');
  });
});
