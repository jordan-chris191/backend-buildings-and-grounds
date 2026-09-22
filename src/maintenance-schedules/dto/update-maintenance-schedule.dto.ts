import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

/** Only metadata and the interval for the schedule's existing basis are editable. */
export class UpdateMaintenanceScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  frequencyHours?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  defaultAssigneeId?: string | null;
}
