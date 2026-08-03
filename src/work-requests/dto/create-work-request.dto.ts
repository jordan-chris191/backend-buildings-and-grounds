// src/work-requests/dto/create-work-request.dto.ts
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { RequestType, Campus } from '@prisma/client';

export class CreateWorkRequestDto {
  @IsEnum(RequestType)
  requestType: RequestType;

  @IsEnum(Campus)
  campus: Campus;

  @IsString()
  requestingOffice: string;

  @IsOptional()
  @IsString()
  particulars?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;

  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}