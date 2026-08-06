import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseRequestItemDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  materialEstimateId?: string;
}

export class CreatePurchaseRequestDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  budgetAllocationId?: string;

  @IsOptional()
  @IsString()
  requestingOfficeId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PurchaseRequestItemDto)
  items: PurchaseRequestItemDto[];
}