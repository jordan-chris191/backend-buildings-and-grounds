// src/auth/auth.service.ts

import { EmailService } from './email.service';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // ---------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
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

  // Add these methods inside the AuthService class

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

    //CREATE USER
    async createUser(dto: { email: string; firstName: string; lastName: string; roleId: string }) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ForbiddenException('A user with this email already exists');
      }

      const defaultPassword = 'staff@123';
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: dto.roleId,
          passwordHash,
        },
        include: { role: true },
      });

      return {
        message: 'User created successfully. Default password: staff@123',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.name,
        },
      };
    }

}