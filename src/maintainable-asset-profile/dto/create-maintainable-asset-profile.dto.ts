import { IsString, IsEnum, IsOptional } from 'class-validator';
import { MaintainableAssetType, MaintenancePriority } from '@prisma/client';

export class CreateMaintainableAssetProfileDto {
  @IsString()
  inventoryItemId: string;

  @IsEnum(MaintainableAssetType)
  assetType: MaintainableAssetType;

  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority; // defaults to ROUTINE if omitted

  @IsOptional()
  @IsString()
  unitTypeConfigId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}