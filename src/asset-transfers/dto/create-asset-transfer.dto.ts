import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { Campus } from '@prisma/client';

export class CreateAssetTransferDto {
  @IsString()
  inventoryItemId: string;

  @IsEnum(Campus)
  fromCampus: Campus;

  @IsEnum(Campus)
  toCampus: Campus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  transferDate?: string;
}