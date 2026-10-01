import { IsOptional, IsObject, IsInt, IsString, IsDateString, Min, Max, IsBoolean, IsEnum } from 'class-validator';
import { CompletionOutcome } from '@prisma/client';

export class CompleteWorkRequestDto {
  @IsDateString()
  @IsOptional()
  dateTimeStarted?: string;

  @IsDateString()
  @IsOptional()
  dateTimeCompleted?: string;

  @IsObject()
  @IsOptional()
  completionDetails?: Record<string, any>;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  serviceRating?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  expectationRating?: number;

  @IsOptional()
  @IsBoolean()
  cannotBeRepaired?: boolean;

  @IsOptional()
  @IsEnum(CompletionOutcome)
  outcome?: CompletionOutcome;

  @IsString()
  @IsOptional()
  comments?: string;
}
