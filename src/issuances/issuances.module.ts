// src/issuances/issuances.module.ts
import { Module } from '@nestjs/common';
import { IssuancesController } from './issuances.controller';
import { IssuancesService } from './issuances.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [IssuancesController],
  providers: [IssuancesService],
})
export class IssuancesModule {}