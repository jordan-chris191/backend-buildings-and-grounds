import { Module } from '@nestjs/common';
import { MaintainableAssetProfilesController } from './maintainable-asset-profiles.controller';
import { MaintainableAssetProfilesService } from './maintainable-asset-profiles.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [MaintainableAssetProfilesController],
  providers: [MaintainableAssetProfilesService],
  exports: [MaintainableAssetProfilesService],
})
export class MaintainableAssetProfilesModule {}