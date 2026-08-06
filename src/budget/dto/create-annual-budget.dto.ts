import { IsInt, IsDecimal, IsOptional, IsString, Min } from 'class-validator';

export class CreateAnnualBudgetDto {
  @IsInt()
  year: number;

  @IsDecimal({ decimal_digits: '4' })
  totalAmount: number;

  @IsOptional()
  @IsString()
  description?: string;
}