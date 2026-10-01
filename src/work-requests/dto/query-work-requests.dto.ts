import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Campus, RequestStatus, WorkRequestSource } from '@prisma/client';

export class QueryWorkRequestsDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsEnum(WorkRequestSource) source?: WorkRequestSource;
  @IsOptional() @IsEnum(Campus) campus?: Campus;
  @IsOptional() @IsString() assignedToMe?: string;
  @IsOptional() @IsString() includeInactive?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 10;
}
