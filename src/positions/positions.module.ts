// src/positions/positions.module.ts
import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PositionsController],
  providers: [PositionsService],
})
export class PositionsModule {}