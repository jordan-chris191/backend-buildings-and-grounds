import { Module } from '@nestjs/common';
import { MaintenanceSchedulesController } from './maintenance-schedules.controller';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';   // ← add this import

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditLogModule,   // ← add this line
  ],
  controllers: [MaintenanceSchedulesController],
  providers: [MaintenanceSchedulesService],
  exports: [MaintenanceSchedulesService],
})
export class MaintenanceSchedulesModule {}