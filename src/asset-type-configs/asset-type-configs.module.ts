import { Module } from '@nestjs/common';
import { AssetTypeConfigsController } from './asset-type-configs.controller';
import { AssetTypeConfigsService } from './asset-type-configs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [AssetTypeConfigsController],
  providers: [AssetTypeConfigsService],
  exports: [AssetTypeConfigsService],
})
export class AssetTypeConfigsModule {}