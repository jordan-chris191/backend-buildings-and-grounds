// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeOfficeDto } from './dto/change-office.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Campus } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Throttle({ default: { limit: 100, ttl: 3600000 } })
  @Post('request-password-reset')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Post('users')
  createUser(@Body() dto: CreateUserDto, @Req() req) {
    return this.authService.createUser(dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER')
  @Get('users')
  findUsers(
    @Query('positionId') positionId?: string,
    @Query('roleId') roleId?: string,
    @Query('officeId') officeId?: string,
    @Query('roleName') roleName?: string,
  ) {
    return this.authService.findUsers(positionId, roleId, officeId, roleName);
  }

  // Kept separate from the operational lookup above so B&G assignment screens
  // do not need an administrator-only management endpoint.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Get('admin/users')
  findManagedUsers(
    @Query('search') search?: string,
    @Query('roleId') roleId?: string,
    @Query('officeId') officeId?: string,
    @Query('positionId') positionId?: string,
    @Query('campus') campus?: Campus,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.authService.findManagedUsers({ search, roleId, officeId, positionId, campus, isActive, page, limit });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Get('admin/users/:id')
  findManagedUser(@Param('id') id: string) {
    return this.authService.findManagedUser(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch('admin/users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req) {
    return this.authService.updateUser(id, dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch('users/:id/role')
  changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto, @Req() req) {
    return this.authService.changeRole(id, dto.roleId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch('users/:id/office')
  changeOffice(@Param('id') id: string, @Body() dto: ChangeOfficeDto, @Req() req) {
    return this.authService.changeOffice(id, dto.officeId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch('users/:id/deactivate')
  deactivateUser(@Param('id') id: string, @Req() req) {
    return this.authService.deactivateUser(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch('users/:id/reactivate')
  reactivateUser(@Param('id') id: string, @Req() req) {
    return this.authService.reactivateUser(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @Req() req,
    @Body() dto: ChangePasswordDto, // ← validated automatically
  ) {
    return this.authService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
