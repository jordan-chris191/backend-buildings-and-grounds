import { IsEnum, IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ItemType } from '@prisma/client';

export class CreateInventoryItemDto {
  @IsString()
  name: string;

  @IsEnum(ItemType)
  type: ItemType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number; 

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  propertyNumber?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;
}