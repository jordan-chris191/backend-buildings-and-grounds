import { Module } from '@nestjs/common';
import { BorrowRequestsController } from './borrow-requests.controller';
import { BorrowRequestsService } from './borrow-requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, GatewayModule, NotificationsModule],
  controllers: [BorrowRequestsController],
  providers: [BorrowRequestsService],
  exports: [BorrowRequestsService],
})
export class BorrowRequestsModule {}