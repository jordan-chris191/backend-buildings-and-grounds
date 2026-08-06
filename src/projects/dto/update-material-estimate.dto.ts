import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMaterialEstimateDto } from './create-material-estimate.dto';

export class UpdateMaterialEstimateDto extends PartialType(
  OmitType(CreateMaterialEstimateDto, ['projectId'] as const),
) {}