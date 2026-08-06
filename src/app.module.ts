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
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MaintenanceSchedulesModule } from './maintenance-schedules/maintenance-schedules.module';
import { PositionsModule } from './positions/positions.module';
import { ProjectsModule } from './projects/projects.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PersonsModule } from './persons/persons.module';
import { OfficesModule } from './offices/offices.module';
import { PurchaseRequestsModule } from './purchase-requests/purchase-requests.module';
import { AssetTransfersModule } from './asset-transfers/asset-transfers.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetModule } from './budget/budget.module';
import { RolesModule } from './roles/roles.module';
import { ReportsModule } from './reports/reports.module';
import { BorrowRequestsModule } from './borrow-requests/borrow-requests.module';
import { GatewayModule } from './gateway/gateway.module';
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
    PersonsModule,
    InventoryModule,
    WorkRequestsModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    MaintenanceSchedulesModule,
    PositionsModule,
    ProjectsModule,
    TransactionsModule,
    OfficesModule,
    PurchaseRequestsModule,
    AssetTransfersModule,
    CategoriesModule,
    RolesModule,
    ReportsModule,
    BudgetModule,
    BorrowRequestsModule,
    GatewayModule
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