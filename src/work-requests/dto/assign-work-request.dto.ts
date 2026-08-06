import { IsString, IsEnum, IsOptional } from 'class-validator';
import { AssignmentRole } from '@prisma/client';
export class AssignWorkRequestDto {
  @IsString()
  userId: string;

  @IsEnum(AssignmentRole)
  role: AssignmentRole;
}