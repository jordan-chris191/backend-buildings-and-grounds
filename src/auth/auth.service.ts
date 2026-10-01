import { EmailService } from './email.service';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';
import { ROLE_CODES } from './role-codes';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Campus, Prisma } from '@prisma/client';


const MAX_FAILED_ATTEMPTS = parseInt(
  process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? '5',
  10,
);
const LOCKOUT_MINUTES = parseInt(
  process.env.LOCKOUT_DURATION_MINUTES ?? '15',
  10,
);
const REFRESH_EXPIRES_DAYS = parseInt(
  process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '7',
  10,
);

// Whitelisted fields for any endpoint that returns a User row.
// Never include passwordHash here.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, name: true, isActive: true } },
  office: { select: { id: true, name: true, campus: true, isActive: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private auditLogService: AuditLogService,
    private readonly gateway: BorrowRequestsGateway,
  ) {}

  private safeUser(user: any) {
    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      isActive: user.isActive, personId: user.personId ?? null,
      role: user.role ? { id: user.role.id, code: user.role.code, name: user.role.name } : null,
      office: user.office ? { id: user.office.id, name: user.office.name, campus: user.office.campus, isActive: user.office.isActive } : null,
      position: user.position ? { id: user.position.id, name: user.position.name, isActive: user.position.isActive } : null,
    };
  }

  /** Validates current assignments only; inactive historical relations remain readable. */
  private async validateOrganization(role: any, office: any, position: any) {
    if (!role?.isActive) throw new BadRequestException('Role must exist and be active');
    const officeRequired = [
      ROLE_CODES.FACULTY,
      ROLE_CODES.PROPERTY_CUSTODIAN,
      ROLE_CODES.CAMPUS_STAFF,
      ROLE_CODES.BUILDING_GROUNDS_OFFICER,
    ].includes(role.code);
    if (officeRequired && !office) throw new BadRequestException(`${role.code} requires an Office`);
    if (office && !office.isActive) throw new BadRequestException('Office must exist and be active');
    if (position && !position.isActive) throw new BadRequestException('Position must exist and be active');
    if (role.code === ROLE_CODES.CAMPUS_STAFF && !position) {
      throw new BadRequestException('CAMPUS_STAFF requires a Position');
    }
  }

  // ---------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true, office: true, position: true },
    });

    if (!user || !user.isActive || !user.role.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account locked. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      await this.handleFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = this.generateAccessToken(user.id, user.role.code, user.authVersion);
    const refreshToken = await this.generateRefreshToken(user.id, user.authVersion);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        roleCode: user.role.code,
        office: user.office ? {
          id: user.office.id,
          name: user.office.name,
          campus: user.office.campus,
          isActive: user.office.isActive,
        } : null,
        position: user.position ? {
          id: user.position.id,
          name: user.position.name,
          isActive: user.position.isActive,
        } : null,
      },
    };
  }

  private async handleFailedLogin(userId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60000)
          : null,
      },
    });
  }

  // ---------------------------------------------------------
  // TOKEN GENERATION
  // ---------------------------------------------------------
  private generateAccessToken(userId: string, roleCode: string, authVersion: number) {
    return this.jwtService.sign(
      { sub: userId, role: roleCode, ver: authVersion },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' as any,
      },
    );
  }

  private async generateRefreshToken(userId: string, authVersion: number) {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date(
      Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        authVersion,
        expiresAt,
      },
    });

    return rawToken;
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ---------------------------------------------------------
  // REFRESH
  // ---------------------------------------------------------
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!storedToken.user.isActive || !storedToken.user.role.isActive || storedToken.authVersion !== storedToken.user.authVersion) {
      throw new UnauthorizedException('Account is inactive or authorization has changed');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const newAccessToken = this.generateAccessToken(
      storedToken.user.id,
      storedToken.user.role.code, storedToken.user.authVersion,
    );
    const newRefreshToken = await this.generateRefreshToken(
      storedToken.user.id,
      storedToken.user.authVersion,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ---------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------
  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully' };
  }

  // ---------------------------------------------------------
  // REQUEST PASSWORD RESET
  // ---------------------------------------------------------
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return the same response, whether or not the email exists —
    // prevents attackers from using this endpoint to enumerate valid accounts
    const genericResponse = {
      message: 'If that email exists, a reset link has been sent.',
    };

    if (!user || !user.isActive) {
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date(
      Date.now() +
        parseInt(process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? '30', 10) *
          60000,
    );

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    const resetLink = `${process.env.FRONTEND_RESET_URL}?token=${rawToken}`;

    await this.emailService.sendPasswordResetEmail(user.email, resetLink);

    return genericResponse;
  }

  // ---------------------------------------------------------
  // RESET PASSWORD
  // ---------------------------------------------------------
  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = this.hashToken(rawToken);

    const storedToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.usedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: storedToken.userId },
        data: {
          passwordHash: newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          authVersion: { increment: 1 },
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: storedToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all existing refresh tokens — force re-login everywhere
      // after a password reset, in case the account was compromised
      this.prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.gateway.disconnectUser(storedToken.userId);

    return { message: 'Password reset successfully' };
  }

  // ---------------------------------------------------------
  // PROFILE (used by /auth/me)
  // ---------------------------------------------------------
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        position: {
          select: { id: true, name: true, isActive: true },
        },
        role: {
          select: { id: true, code: true, name: true },
        },
        office: {
          select: { id: true, name: true, campus: true, isActive: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      name: `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  // ---------------------------------------------------------
  // CREATE USER
  // ---------------------------------------------------------
  async createUser(
    dto: {
      email: string;
      firstName: string;
      lastName: string;
      roleId: string;
      positionId?: string;
      officeId?: string;
      personId?: string;
      password?: string;
    },
    performedById: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ForbiddenException('A user with this email already exists');
    }

    const [role, office, position, person] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: dto.roleId } }),
      dto.officeId ? this.prisma.office.findUnique({ where: { id: dto.officeId } }) : null,
      dto.positionId ? this.prisma.position.findUnique({ where: { id: dto.positionId } }) : null,
      dto.personId ? this.prisma.person.findUnique({ where: { id: dto.personId } }) : null,
    ]);
    await this.validateOrganization(role, office, position);
    if (dto.personId && !person?.isActive) throw new BadRequestException('Person must exist and be active');
    if (dto.personId && await this.prisma.user.findUnique({ where: { personId: dto.personId } })) {
      throw new ForbiddenException('Person is already linked to another user account');
    }

    const provisionedPassword = dto.password ?? 'staff@123';
    const passwordHash = await bcrypt.hash(provisionedPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: dto.roleId,
        positionId: dto.positionId,
        officeId: dto.officeId,
        personId: dto.personId,
        passwordHash,
      },
      include: { role: true, position: true, office: true, person: true },
    });

    await this.auditLogService.log({
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      description: `Created user ${user.email} with role ${user.role.code}`,
      metadata: { roleId: user.roleId, officeId: user.officeId, positionId: user.positionId },
      performedById,
    });

    return {
      message: dto.password ? 'User created successfully.' : 'User created successfully. Default password: staff@123',
      user: this.safeUser(user),
    };
  }

  // ---------------------------------------------------------
  // FIND USERS (list, with filters)
  // ---------------------------------------------------------
  async findUsers(
    positionId?: string,
    roleId?: string,
    officeId?: string,
    roleName?: string,
  ) {
    return this.prisma.user.findMany({
      where: {
        ...(positionId ? { positionId } : {}),
        ...(roleId ? { roleId } : {}),
        ...(officeId ? { officeId } : {}),
        ...(roleName ? { role: { name: roleName } } : {}),
        isActive: true,
      },
      select: SAFE_USER_SELECT,
      orderBy: { firstName: 'asc' },
    });
  }

  async findManagedUsers(query: {
    search?: string; roleId?: string; officeId?: string; positionId?: string;
    campus?: Campus; isActive?: string; page?: string; limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const active = query.isActive === undefined ? undefined : query.isActive === 'true';
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.officeId ? { officeId: query.officeId } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
      ...(query.campus ? { office: { is: { campus: query.campus } } } : {}),
      ...(active === undefined ? {} : { isActive: active }),
      ...(search ? { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: SAFE_USER_SELECT, skip: (page - 1) * limit, take: limit, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }] }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findManagedUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(userId: string, dto: { email?: string; firstName?: string; lastName?: string; roleId?: string; officeId?: string | null; positionId?: string | null }, performedById: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true, office: true, position: true } });
    if (!user) throw new NotFoundException('User not found');
    if (dto.email && dto.email !== user.email) {
      const owner = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (owner) throw new ForbiddenException('A user with this email already exists');
    }
    const [role, office, position] = await Promise.all([
      dto.roleId ? this.prisma.role.findUnique({ where: { id: dto.roleId } }) : user.role,
      dto.officeId === undefined ? user.office : dto.officeId ? this.prisma.office.findUnique({ where: { id: dto.officeId } }) : null,
      dto.positionId === undefined ? user.position : dto.positionId ? this.prisma.position.findUnique({ where: { id: dto.positionId } }) : null,
    ]);
    await this.validateOrganization(role, office, position);
    const changedAuth = dto.roleId !== undefined && dto.roleId !== user.roleId;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { ...(dto.email !== undefined && { email: dto.email }), ...(dto.firstName !== undefined && { firstName: dto.firstName }), ...(dto.lastName !== undefined && { lastName: dto.lastName }), ...(dto.roleId !== undefined && { roleId: dto.roleId }), ...(dto.officeId !== undefined && { officeId: dto.officeId }), ...(dto.positionId !== undefined && { positionId: dto.positionId }), ...(changedAuth && { authVersion: { increment: 1 } }) },
      select: SAFE_USER_SELECT,
    });
    await this.auditLogService.log({ action: 'USER_UPDATED', entityType: 'User', entityId: userId, description: `Updated user ${user.email}`, metadata: { previous: { email: user.email, roleId: user.roleId, officeId: user.officeId, positionId: user.positionId }, next: { email: updated.email, roleId: updated.role.id, officeId: updated.office?.id ?? null, positionId: updated.position?.id ?? null } }, performedById });
    if (dto.roleId !== undefined && dto.roleId !== user.roleId) {
      await this.auditLogService.log({ action: 'USER_ROLE_CHANGED', entityType: 'User', entityId: userId, description: `Changed user role to ${updated.role.code}`, metadata: { previousRoleId: user.roleId, roleId: dto.roleId }, performedById });
    }
    if (dto.officeId !== undefined && dto.officeId !== user.officeId) {
      await this.auditLogService.log({ action: 'USER_OFFICE_CHANGED', entityType: 'User', entityId: userId, description: 'Changed user Office', metadata: { previousOfficeId: user.officeId, officeId: dto.officeId }, performedById });
    }
    if (dto.positionId !== undefined && dto.positionId !== user.positionId) {
      await this.auditLogService.log({ action: 'USER_POSITION_CHANGED', entityType: 'User', entityId: userId, description: 'Changed user Position', metadata: { previousPositionId: user.positionId, positionId: dto.positionId }, performedById });
    }
    if (changedAuth) this.gateway.disconnectUser(userId);
    return updated;
  }

  // ---------------------------------------------------------
  // CHANGE ROLE
  // ---------------------------------------------------------
  async changeRole(userId: string, newRoleId: string, performedById: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, office: true, position: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Safeguard: prevent removing the last active Administrator
    if (user.role.code === ROLE_CODES.ADMINISTRATOR) {
      const activeAdminCount = await this.prisma.user.count({
        where: { isActive: true, role: { code: ROLE_CODES.ADMINISTRATOR } },
      });
      if (activeAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot change role of the last active Administrator. Promote another user first.',
        );
      }
    }

    const newRole = await this.prisma.role.findUnique({ where: { id: newRoleId } });
    if (!newRole?.isActive) {
      throw new BadRequestException('Role must exist and be active');
    }
    await this.validateOrganization(newRole, user.office, user.position);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId: newRoleId, authVersion: { increment: 1 } },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: userId,
      description: `Changed ${user.email}'s role from ${user.role.code} to ${newRole.code}`,
      metadata: { previousRoleId: user.roleId, roleId: newRoleId },
      performedById,
    });
    this.gateway.disconnectUser(userId);

    return updated;
  }

  // ---------------------------------------------------------
  // CHANGE OFFICE
  // ---------------------------------------------------------
  async changeOffice(userId: string, officeId: string | undefined, performedById: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true, position: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const office = officeId ? await this.prisma.office.findUnique({ where: { id: officeId } }) : null;
    await this.validateOrganization(user.role, office, user.position);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { officeId: officeId ?? null },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'USER_OFFICE_CHANGED',
      entityType: 'User',
      entityId: userId,
      description: officeId
        ? `Assigned user ${user.email} to office ${officeId}`
        : `Cleared office for user ${user.email}`,
      metadata: { previousOfficeId: user.officeId, officeId: officeId ?? null },
      performedById,
    });

    return updated;
  }

  // ---------------------------------------------------------
  // DEACTIVATE USER
  // ---------------------------------------------------------
  async deactivateUser(userId: string, performedById: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.code === ROLE_CODES.ADMINISTRATOR) {
      const activeAdminCount = await this.prisma.user.count({
        where: { isActive: true, role: { code: ROLE_CODES.ADMINISTRATOR } },
      });
      if (activeAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot deactivate the last active Administrator. Promote another user first.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, authVersion: { increment: 1 } },
      select: SAFE_USER_SELECT,
    });

    // Revoke all their active sessions immediately
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.gateway.disconnectUser(userId);

    await this.auditLogService.log({
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: userId,
      description: `Deactivated user ${user.email}`,
      performedById,
    });

    return updated;
  }

  // ---------------------------------------------------------
  // REACTIVATE USER
  // ---------------------------------------------------------
  async reactivateUser(userId: string, performedById: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        authVersion: { increment: 1 },
      },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'USER_REACTIVATED',
      entityType: 'User',
      entityId: userId,
      description: `Reactivated user ${user.email}`,
      performedById,
    });

    return updated;
  }

  async changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedException('User not found or inactive');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedException('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await this.prisma.$transaction([
    this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, authVersion: { increment: 1 } },
    }),
    // Revoke all refresh tokens – user must re-login with the new password
    this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  this.gateway.disconnectUser(userId);

  await this.auditLogService.log({
    action: 'CHANGE_PASSWORD',
    entityType: 'User',
    entityId: userId,
    description: `User ${user.email} changed their password`,
    performedById: userId,
  });

  return { message: 'Password changed successfully. Please log in again.' };
}
}
