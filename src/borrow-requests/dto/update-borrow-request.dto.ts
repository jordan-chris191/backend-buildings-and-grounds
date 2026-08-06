import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { BorrowRequestStatus, TransactionType } from '@prisma/client';

export class UpdateBorrowRequestDto {
  @IsOptional()
  @IsEnum(BorrowRequestStatus)
  status?: BorrowRequestStatus;

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}