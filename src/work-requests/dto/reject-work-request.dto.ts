// src/work-requests/dto/reject-work-request.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectWorkRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}