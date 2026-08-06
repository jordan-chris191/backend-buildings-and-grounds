import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

// Allows partial update of all fields except those that shouldn't be changed arbitrarily
export class UpdateInventoryItemDto extends PartialType(
  OmitType(CreateInventoryItemDto, ['type', 'campus'] as const),
) {}