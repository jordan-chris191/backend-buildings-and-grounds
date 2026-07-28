import { IsEnum, IsString, IsOptional, IsInt, Min } from 'class-validator';
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
  @IsInt()
  @Min(0)
  quantity?: number;

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
}