import { Module } from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsController } from './stock-movements.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { InventoryLedgerService } from './inventory-ledger.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [StockMovementsController],
  providers: [StockMovementsService, InventoryLedgerService],
  exports: [StockMovementsService, InventoryLedgerService],
})
export class StockMovementsModule {}
