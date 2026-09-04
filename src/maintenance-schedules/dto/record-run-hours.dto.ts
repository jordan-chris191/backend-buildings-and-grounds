import { IsNumber, Min } from 'class-validator';

export class RecordRunHoursDto {
  @IsNumber()
  @Min(0)
  hours: number; // cumulative reading, not a delta
}