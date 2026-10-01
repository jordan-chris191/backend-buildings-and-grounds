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

  describe('organization relationship rules', () => {
    const activeOffice = { id: 'office-1', isActive: true, campus: 'MC1' };
    const activePosition = { id: 'position-1', isActive: true };

    it('requires an Office for FACULTY', async () => {
      await expect((service as any).validateOrganization({ code: 'FACULTY', isActive: true }, null, null))
        .rejects.toThrow('FACULTY requires an Office');
    });

    it('requires an Office and active Position for CAMPUS_STAFF', async () => {
      await expect((service as any).validateOrganization({ code: 'CAMPUS_STAFF', isActive: true }, activeOffice, null))
        .rejects.toThrow('CAMPUS_STAFF requires a Position');
      await expect((service as any).validateOrganization({ code: 'CAMPUS_STAFF', isActive: true }, activeOffice, { ...activePosition, isActive: false }))
        .rejects.toThrow('Position must exist and be active');
      await expect((service as any).validateOrganization({ code: 'CAMPUS_STAFF', isActive: true }, activeOffice, activePosition))
        .resolves.toBeUndefined();
    });

    it('allows an ADMINISTRATOR without Office or Position', async () => {
      await expect((service as any).validateOrganization({ code: 'ADMINISTRATOR', isActive: true }, null, null))
        .resolves.toBeUndefined();
    });
  });
});
