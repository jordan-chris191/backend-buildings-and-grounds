// src/work-requests/dto/approve-work-request.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveWorkRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}