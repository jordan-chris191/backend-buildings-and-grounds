import { IsString, IsOptional, IsInt, Min, IsDateString } from 'class-validator';

export class CreateIssuanceDto {
  @IsString()
  inventoryItemId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsString()
  borrowerName: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsDateString()
  dueBackAt?: string;
}