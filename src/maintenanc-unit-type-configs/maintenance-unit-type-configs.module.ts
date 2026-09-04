import { Module } from '@nestjs/common';
import { MaintenanceUnitTypeConfigsController } from './maintenance-unit-type-configs.controller';
import { MaintenanceUnitTypeConfigsService } from './maintenance-unit-type-configs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [MaintenanceUnitTypeConfigsController],
  providers: [MaintenanceUnitTypeConfigsService],
  exports: [MaintenanceUnitTypeConfigsService],
})
export class MaintenanceUnitTypeConfigsModule {}