import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMaintenanceUnitTypeConfigDto } from './create-maintenance-unit-type-config.dto';

// unitType is the unique key — rename via delete+recreate, not update,
// since existing profiles reference this row by id, not by the string value
export class UpdateMaintenanceUnitTypeConfigDto extends PartialType(
  OmitType(CreateMaintenanceUnitTypeConfigDto, ['unitType'] as const),
) {}