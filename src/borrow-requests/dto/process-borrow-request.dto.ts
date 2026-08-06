import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { TransactionType } from '@prisma/client';

export class ProcessBorrowRequestDto {
  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;   // ISSUANCE or WITHDRAWAL or RETURN

  @IsOptional()
  @IsString()
  notes?: string;

  // NEW
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}