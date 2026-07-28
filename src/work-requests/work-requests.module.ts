// src/work-requests/work-requests.module.ts
import { Module } from '@nestjs/common';
import { WorkRequestsController } from './work-requests.controller';
import { WorkRequestsService } from './work-requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WorkRequestsController],
  providers: [WorkRequestsService],
})
export class WorkRequestsModule {}