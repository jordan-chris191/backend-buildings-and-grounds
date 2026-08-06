// src/work-requests/dto/create-work-request.dto.ts

import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsObject,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestType, Campus } from '@prisma/client';

class WorkRequestItemDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CreateWorkRequestDto {
  @IsEnum(RequestType)
  requestType: RequestType;

  @IsString()
  @IsOptional()
  particulars?: string;

  @IsObject()
  @IsOptional()
  details?: Record<string, any>;

  @IsDateString()
  @IsOptional()
  deadline?: string;

  @IsEnum(Campus)
  campus: Campus;

  @IsOptional()
  @IsString()
  requestingOfficeId?: string;

  @IsOptional()
  @IsString()
  maintenanceScheduleId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional() // ← MAKE IT OPTIONAL
  @Type(() => WorkRequestItemDto)
  items?: WorkRequestItemDto[]; // ← Allow undefined or empty array
}