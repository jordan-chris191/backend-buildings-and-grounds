import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [PrismaModule, AuthModule, GatewayModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],   // ← add this
})
export class NotificationsModule {}