// src/withdrawals/dto/create-withdrawal.dto.ts
import { IsString, IsNumber, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  inventoryItemId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  withdrawnByName: string;
}