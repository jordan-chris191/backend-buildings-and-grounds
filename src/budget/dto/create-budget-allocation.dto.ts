import { IsString, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { Trade } from '@prisma/client';

export class CreateBudgetAllocationDto {
  @IsString()
  name: string;

  @IsEnum(Trade)
  trade: Trade;

  @IsDecimal({ decimal_digits: '4' })
  allocatedAmount: number;

  @IsString()
  annualBudgetId: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}