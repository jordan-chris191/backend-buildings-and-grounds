import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { RequestPriority, RequestType } from '@prisma/client';
import { WorkRequestItemDto } from './create-work-request.dto';

export class CreateWalkInWorkRequestDto {
  @IsString()
  @IsNotEmpty()
  walkInRequesterName: string;

  @IsOptional()
  @IsString()
  walkInRequesterContact?: string;

  @IsString()
  requestingOfficeId: string;

  @IsEnum(RequestType)
  requestType: RequestType;

  @IsOptional()
  @IsString()
  particulars?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkRequestItemDto)
  items?: WorkRequestItemDto[];
}
