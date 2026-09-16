// src/gateway/borrow-requests.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*', // For development – restrict in production
  },
  namespace: '/borrow-requests',
})
export class BorrowRequestsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}
  @WebSocketServer()
  server: Server;

  private connectedClients: Map<string, Set<string>> = new Map();

  async handleConnection(client: Socket) {
    const rawToken = client.handshake.auth?.token;
    const token = typeof rawToken === 'string' ? rawToken.replace(/^Bearer\s+/i, '') : '';
    try {
      if (!token) throw new Error('missing access token');
      const payload = await this.jwt.verifyAsync<{ sub: string; role: string }>(token, { secret: process.env.JWT_ACCESS_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, isActive: true } });
      if (!user?.isActive) throw new Error('inactive user');
      client.data.userId = user.id;
      client.join(`user:${user.id}`);
      const sockets = this.connectedClients.get(user.id) ?? new Set<string>();
      sockets.add(client.id);
      this.connectedClients.set(user.id, sockets);
    } catch {
      client.emit('connect_error', { message: 'Unauthorized socket connection' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const sockets = this.connectedClients.get(userId);
    sockets?.delete(client.id);
    if (sockets?.size === 0) this.connectedClients.delete(userId);
  }

  // ✅ Notify a specific user about their borrow request update
  notifyUser(userId: string, data: {
    requestId: string;
    status: string;
    message: string;
  }) {
    if (this.connectedClients.has(userId)) {
      this.server.to(`user:${userId}`).emit('borrow-request-update', data);
      console.log(`📩 Sent notification to user ${userId}`);
    } else {
      console.log(`⚠️ User ${userId} not connected`);
    }
  }

  // Notify a user about a brand‑new notification record
  notifyNewNotification(userId: string, notification: any) {
    if (!this.connectedClients.has(userId)) return;
    this.server.to(`user:${userId}`).emit('notification', {
      id: notification.id, type: notification.type, title: notification.title,
      message: notification.message, referenceNo: notification.referenceNo,
      workRequestId: notification.workRequestId, createdAt: notification.createdAt,
      isRead: notification.isRead,
    });
  }

  // ✅ Broadcast to all connected users (for admin announcements)
  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}
