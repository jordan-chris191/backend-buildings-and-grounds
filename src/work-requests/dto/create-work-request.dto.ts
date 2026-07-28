// src/work-requests/dto/create-work-request.dto.ts
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { RequestType } from '@prisma/client';

export class CreateWorkRequestDto {
  @IsEnum(RequestType)
  requestType: RequestType;

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