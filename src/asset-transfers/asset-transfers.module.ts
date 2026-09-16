import { Module } from '@nestjs/common';
import { AssetTransfersController } from './asset-transfers.controller';
import { AssetTransfersService } from './asset-transfers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, StockMovementsModule],
  controllers: [AssetTransfersController],
  providers: [AssetTransfersService],
  exports: [AssetTransfersService],
})
export class AssetTransfersModule {}
