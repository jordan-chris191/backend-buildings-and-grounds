// src/gateway/borrow-requests.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // For development – restrict in production
  },
  namespace: '/borrow-requests',
})
export class BorrowRequestsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedClients: Map<string, string> = new Map(); // userId -> socketId

  handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    if (userId) {
      this.connectedClients.set(userId, client.id);
      console.log(`✅ User ${userId} connected (socket: ${client.id})`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.connectedClients.entries()) {
      if (socketId === client.id) {
        this.connectedClients.delete(userId);
        console.log(`❌ User ${userId} disconnected`);
        break;
      }
    }
  }

  // ✅ Notify a specific user about their borrow request update
  notifyUser(userId: string, data: {
    requestId: string;
    status: string;
    message: string;
  }) {
    const socketId = this.connectedClients.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('borrow-request-update', data);
      console.log(`📩 Sent notification to user ${userId}`);
    } else {
      console.log(`⚠️ User ${userId} not connected`);
    }
  }

  // Notify a user about a brand‑new notification record
notifyNewNotification(userId: string, notification: any) {
  const socketId = this.connectedClients.get(userId);
  if (socketId) {
    this.server.to(socketId).emit('notification', notification);
  }
}

  // ✅ Broadcast to all connected users (for admin announcements)
  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}