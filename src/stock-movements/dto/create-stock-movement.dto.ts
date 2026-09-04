import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';

export class CreateStockMovementDto {
  @IsUUID()
  inventoryItemId: string;

  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  /**
   * Can be positive (RECEIVED, RETURNED, positive ADJUSTED)
   * or negative (WITHDRAWN, negative ADJUSTED).
   */
  @IsNumber()
  quantityChange: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

}