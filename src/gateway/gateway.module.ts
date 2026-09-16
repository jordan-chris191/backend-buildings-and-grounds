// src/gateway/gateway.module.ts
import { Module } from '@nestjs/common';
import { BorrowRequestsGateway } from './borrow-requests.gateway';
import { InventoryGateway } from './inventory.gateway';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  providers: [BorrowRequestsGateway, InventoryGateway],
  exports: [BorrowRequestsGateway, InventoryGateway],
})
export class GatewayModule {}
