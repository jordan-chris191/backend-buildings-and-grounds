import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAnnualBudgetDto } from './create-annual-budget.dto';

export class UpdateAnnualBudgetDto extends PartialType(
  OmitType(CreateAnnualBudgetDto, ['year'] as const),
) {}