import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { WorkRequestsModule } from './work-requests/work-requests.module';
import { IssuancesModule } from './issuances/issuances.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MaintenanceSchedulesModule } from './maintenance-schedules/maintenance-schedules.module';
import { PositionsModule } from './positions/positions.module';
import { ProjectsModule } from './projects/projects.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    PrismaModule,
    AuthModule,
    InventoryModule,
    WorkRequestsModule,
    IssuancesModule,
    WithdrawalsModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    MaintenanceSchedulesModule,
    PositionsModule,
    ProjectsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}