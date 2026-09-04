import { IsEnum, IsString, IsOptional } from 'class-validator';
import { MaintainableAssetType } from '@prisma/client';

export class CreateAssetTypeConfigDto {
  @IsEnum(MaintainableAssetType)
  assetType: MaintainableAssetType;

  @IsString()
  positionId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}