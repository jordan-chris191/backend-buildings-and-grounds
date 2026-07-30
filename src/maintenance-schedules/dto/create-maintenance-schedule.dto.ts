// src/maintenance-schedules/dto/create-maintenance-schedule.dto.ts
import { IsString, IsInt, Min, IsDateString } from 'class-validator';

export class CreateMaintenanceScheduleDto {
  @IsString()
  title: string;

  @IsString()
  inventoryItemId: string;

  @IsInt()
  @Min(1)
  frequencyDays: number;

  @IsDateString()
  nextDueAt: string;
}