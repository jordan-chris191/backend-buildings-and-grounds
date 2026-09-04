import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateMaintenanceUnitTypeConfigDto {
  @IsString()
  unitType: string; // e.g. "inverter", "split", "wall_mounted"

  @IsInt()
  @Min(1)
  defaultCooldownDays: number;

  @IsOptional()
  @IsString()
  notes?: string;
}