import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsDateString,
  ValidateIf,
  Min,
} from 'class-validator';
import { MaintenanceBasis } from '@prisma/client';

export class CreateMaintenanceScheduleDto {
  @IsString()
  title: string;

  @IsEnum(MaintenanceBasis)
  basis: MaintenanceBasis;

  @IsString()
  inventoryItemId: string;

  // CALENDAR-only — required unless the profile's unit type config supplies a default
  @ValidateIf((o) => o.basis === MaintenanceBasis.CALENDAR)
  @IsOptional()
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  // CALENDAR-only — first due date, required when basis is CALENDAR
  @ValidateIf((o) => o.basis === MaintenanceBasis.CALENDAR)
  @IsDateString()
  nextDueAt?: string;

  // RUNTIME-only
  @ValidateIf((o) => o.basis === MaintenanceBasis.RUNTIME)
  @IsNumber()
  @Min(1)
  frequencyHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}