// src/gateway/inventory.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/inventory',
})
export class InventoryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`🔌 Inventory client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔌 Inventory client disconnected: ${client.id}`);
  }

  // ✅ Updated to accept optional status
  notifyInventoryUpdate(itemId: string, itemName: string, newQuantity: number, status?: string) {
    this.server.emit('inventory-update', {
      itemId,
      itemName,
      newQuantity,
      status,
      timestamp: new Date().toISOString(),
    });
    console.log(`📦 Inventory update: ${itemName} now has ${newQuantity} (status: ${status})`);
  }
}