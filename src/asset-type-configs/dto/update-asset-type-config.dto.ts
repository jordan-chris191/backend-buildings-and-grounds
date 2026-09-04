import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAssetTypeConfigDto } from './create-asset-type-config.dto';

// assetType is the unique key — changing it should mean deleting and
// recreating the mapping, not repointing an existing row
export class UpdateAssetTypeConfigDto extends PartialType(
  OmitType(CreateAssetTypeConfigDto, ['assetType'] as const),
) {}