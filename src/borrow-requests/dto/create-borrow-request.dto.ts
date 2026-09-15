import { IsString, IsNumber, IsOptional, IsDateString, Min, IsEnum } from 'class-validator';
import { Campus } from '@prisma/client';

export class CreateBorrowRequestDto {
  @IsString()
  inventoryItemId: string;

  @IsEnum(Campus)
  campus: Campus;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
