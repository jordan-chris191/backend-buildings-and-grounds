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
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';


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
  role: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  office: { select: { id: true, name: true, campus: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private auditLogService: AuditLogService,
  ) {}

  // ---------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true, office: true },
    });

    if (!user || !user.isActive) {
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

    const accessToken = this.generateAccessToken(user.id, user.role.name);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        office: user.office ? {   // ✅ Add this
        id: user.office.id,
        name: user.office.name,
        campus: user.office.campus,
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
  private generateAccessToken(userId: string, role: string) {
    return this.jwtService.sign(
      { sub: userId, role },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' as any,
      },
    );
  }

  private async generateRefreshToken(userId: string) {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date(
      Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
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

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const newAccessToken = this.generateAccessToken(
      storedToken.user.id,
      storedToken.user.role.name,
    );
    const newRefreshToken = await this.generateRefreshToken(
      storedToken.user.id,
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
          select: { id: true, name: true },
        },
        role: {
          select: { id: true, name: true },
        },
        office: {
          select: { id: true, name: true, campus: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
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
    if (!role?.isActive) throw new BadRequestException('Role must exist and be active');
    if (dto.officeId && !office?.isActive) throw new BadRequestException('Office must exist and be active');
    if (dto.positionId && !position?.isActive) throw new BadRequestException('Position must exist and be active');
    if (dto.personId && !person?.isActive) throw new BadRequestException('Person must exist and be active');
    if (dto.personId && await this.prisma.user.findUnique({ where: { personId: dto.personId } })) {
      throw new ForbiddenException('Person is already linked to another user account');
    }

    const defaultPassword = 'staff@123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

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
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      description: `Created user ${user.email} with role ${user.role.name}`,
      performedById,
    });

    return {
      message: 'User created successfully. Default password: staff@123',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        position: user.position?.name ?? null,
        office: user.office?.name ?? null,
        personId: user.personId,
      },
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

  // ---------------------------------------------------------
  // CHANGE ROLE
  // ---------------------------------------------------------
  async changeRole(userId: string, newRoleId: string, performedById: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Safeguard: prevent removing the last active Administrator
    if (user.role.name === 'Administrator') {
      const activeAdminCount = await this.prisma.user.count({
        where: { isActive: true, role: { name: 'Administrator' } },
      });
      if (activeAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot change role of the last active Administrator. Promote another user first.',
        );
      }
    }

    const newRole = await this.prisma.role.findUnique({ where: { id: newRoleId } });
    if (!newRole) {
      throw new NotFoundException('Role not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId: newRoleId },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'ROLE_CHANGE',
      entityType: 'User',
      entityId: userId,
      description: `Changed ${user.email}'s role from ${user.role.name} to ${newRole.name}`,
      performedById,
    });

    return updated;
  }

  // ---------------------------------------------------------
  // CHANGE OFFICE
  // ---------------------------------------------------------
  async changeOffice(userId: string, officeId: string | undefined, performedById: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (officeId) {
      const office = await this.prisma.office.findUnique({ where: { id: officeId } });
      if (!office) {
        throw new NotFoundException('Office not found');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { officeId: officeId ?? null },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'UPDATE',
      entityType: 'User',
      entityId: userId,
      description: officeId
        ? `Assigned user ${user.email} to office ${officeId}`
        : `Cleared office for user ${user.email}`,
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

    if (user.role.name === 'Administrator') {
      const activeAdminCount = await this.prisma.user.count({
        where: { isActive: true, role: { name: 'Administrator' } },
      });
      if (activeAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot deactivate the last active Administrator. Promote another user first.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: SAFE_USER_SELECT,
    });

    // Revoke all their active sessions immediately
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditLogService.log({
      action: 'DEACTIVATE',
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
      },
      select: SAFE_USER_SELECT,
    });

    await this.auditLogService.log({
      action: 'REACTIVATE',
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
      data: { passwordHash: newHash },
    }),
    // Revoke all refresh tokens – user must re-login with the new password
    this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

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
