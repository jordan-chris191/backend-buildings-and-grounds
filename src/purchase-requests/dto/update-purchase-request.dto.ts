import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePurchaseRequestDto } from './create-purchase-request.dto';

export class UpdatePurchaseRequestDto extends PartialType(
  OmitType(CreatePurchaseRequestDto, ['items'] as const),
) {
  // You might allow adding/removing items separately through dedicated endpoints,
  // but for simplicity, we'll keep the items array optional.
}