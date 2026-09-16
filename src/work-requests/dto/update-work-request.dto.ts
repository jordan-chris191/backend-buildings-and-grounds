import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { RequestPriority, RequestType } from '@prisma/client';

/** Safe metadata edits; walk-in identity fields apply only to WALK_IN records. */
export class UpdateWorkRequestDto {
  @IsOptional() @IsString() particulars?: string;
  @IsOptional() @IsObject() details?: Record<string, any>;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(RequestPriority) priority?: RequestPriority;
  @IsOptional() @IsString() requestingOfficeId?: string;
  @IsOptional() @IsEnum(RequestType) requestType?: RequestType;
  @IsOptional() @IsString() walkInRequesterName?: string;
  @IsOptional() @IsString() walkInRequesterContact?: string;
}
