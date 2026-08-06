import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateBorrowRequestDto {
  @IsString()
  inventoryItemId: string;

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