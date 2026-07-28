import { Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findMine(@Req() req) {
    return this.notificationsService.findMine(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Req() req) {
    return this.notificationsService.unreadCount(req.user.userId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }

  @Patch('read-all')
  markAllAsRead(@Req() req) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}