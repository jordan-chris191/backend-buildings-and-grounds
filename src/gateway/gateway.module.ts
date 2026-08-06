// src/gateway/gateway.module.ts
import { Module } from '@nestjs/common';
import { BorrowRequestsGateway } from './borrow-requests.gateway';
import { InventoryGateway } from './inventory.gateway';

@Module({
  providers: [BorrowRequestsGateway, InventoryGateway],
  exports: [BorrowRequestsGateway, InventoryGateway],
})
export class GatewayModule {}