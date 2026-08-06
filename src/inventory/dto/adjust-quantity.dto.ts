import { IsNumber, IsString, Min } from 'class-validator';

export class AdjustQuantityDto {
  @IsNumber()
  @Min(0)
  newQuantity: number;

  @IsString()
  reason: string;
}