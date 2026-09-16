import {
  IsArray,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Campus } from '@prisma/client';

// Nested DTO for each item in the batch
export class BatchTransferItemDto {
  @IsString()
  inventoryItemId: string;

  @IsDecimal({ decimal_digits: '4' }) // or use @IsNumber({ maxDecimalPlaces: 4 }) with v0.14+
  quantity: string | number;
}

export class CreateAssetTransferBatchDto {
  /** Explicit authoritative source balance campus. */
  @IsOptional()
  @IsEnum(Campus)
  sourceCampus?: Campus;

  /** Explicit destination campus. */
  @IsOptional()
  @IsEnum(Campus)
  destinationCampus?: Campus;

  /** @deprecated Compatibility alias for sourceCampus. */
  @IsOptional()
  @IsEnum(Campus)
  fromCampus?: Campus;

  /** @deprecated Compatibility alias for destinationCampus. */
  @IsEnum(Campus)
  @IsOptional()
  toCampus?: Campus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  newHolderId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTransferItemDto)
  items: BatchTransferItemDto[];
}
