// src/inventory/inventory.module.ts
import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, GatewayModule, StockMovementsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
