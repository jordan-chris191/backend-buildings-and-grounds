// src/maintenance-schedules/maintenance-schedules.module.ts
import { Module } from '@nestjs/common';
import { MaintenanceSchedulesController } from './maintenance-schedules.controller';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MaintenanceSchedulesController],
  providers: [MaintenanceSchedulesService],
})
export class MaintenanceSchedulesModule {}