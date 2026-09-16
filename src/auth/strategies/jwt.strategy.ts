// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET is not defined in environment variables',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; ver?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!user?.isActive || !user.role?.isActive || payload.ver !== user.authVersion) {
      throw new UnauthorizedException('Token is no longer valid.');
    }
    return { userId: user.id, role: user.role.code };
  }
}
