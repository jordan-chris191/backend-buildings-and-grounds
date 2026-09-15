import {
  IsEnum,
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { Campus, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @IsString()
  inventoryItemId: string;

  @IsEnum(Campus)
  campus: Campus;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  personId?: string; // the recipient (student/staff/etc.)

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
