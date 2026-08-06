// src/inventory/inventory.module.ts
import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { GatewayModule } from 'src/gateway/gateway.module';
@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, GatewayModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}