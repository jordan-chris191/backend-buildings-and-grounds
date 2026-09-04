import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMaintainableAssetProfileDto } from './create-maintainable-asset-profile.dto';

// inventoryItemId is set once at creation and never changed — if the asset's
// item link is wrong, the profile should be deleted and recreated, not repointed
export class UpdateMaintainableAssetProfileDto extends PartialType(
  OmitType(CreateMaintainableAssetProfileDto, ['inventoryItemId'] as const),
) {}