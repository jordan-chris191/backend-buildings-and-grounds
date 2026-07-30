// src/withdrawals/withdrawals.controller.ts
import { Body, Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrator', 'Building & Grounds Officer', 'Property Custodian')
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private withdrawalsService: WithdrawalsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.create(req.user.userId, dto);
  }

  @Get()
  findAll() {
    return this.withdrawalsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.withdrawalsService.findOne(id);
  }
}