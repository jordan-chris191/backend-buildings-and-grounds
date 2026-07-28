// src/work-requests/dto/complete-work-request.dto.ts
import { IsOptional, IsDateString, IsObject, IsInt, Min, Max, IsString } from 'class-validator';

export class CompleteWorkRequestDto {
  @IsOptional()
  @IsDateString()
  dateTimeStarted?: string;

  @IsOptional()
  @IsDateString()
  dateTimeCompleted?: string;

  @IsOptional()
  @IsObject()
  completionDetails?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  serviceRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  expectationRating?: number;

  @IsOptional()
  @IsString()
  comments?: string;
}