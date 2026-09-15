import { Module } from '@nestjs/common';
import { BorrowRequestsController } from './borrow-requests.controller';
import { BorrowRequestsService } from './borrow-requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, GatewayModule, NotificationsModule, StockMovementsModule],
  controllers: [BorrowRequestsController],
  providers: [BorrowRequestsService],
  exports: [BorrowRequestsService],
})
export class BorrowRequestsModule {}
