import { IsOptional, IsObject, IsInt, IsString, IsDateString } from 'class-validator';

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
  serviceRating?: number;

  @IsInt()
  @IsOptional()
  expectationRating?: number;

  @IsString()
  @IsOptional()
  comments?: string;
}