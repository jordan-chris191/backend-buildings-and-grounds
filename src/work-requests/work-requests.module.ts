import { Module } from '@nestjs/common';
import { WorkRequestsController } from './work-requests.controller';
import { WorkRequestsService } from './work-requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';   // ← path correct?
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditLogModule,   // ← must be here
    NotificationsModule,
  ],
  controllers: [WorkRequestsController],
  providers: [WorkRequestsService],
  exports: [WorkRequestsService],
})
export class WorkRequestsModule {}