// src/work-requests/dto/assign-work-request.dto.ts
import { IsString, IsOptional, IsDateString } from 'class-validator';

export class AssignWorkRequestDto {
  @IsString()
  userId: string;

  @IsString()
  role: string; // "Technician", "Plumber", "Lead", etc.

  @IsOptional()
  @IsDateString()
  deadline?: string;
}