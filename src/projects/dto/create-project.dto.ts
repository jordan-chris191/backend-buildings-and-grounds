// src/projects/dto/create-project.dto.ts
import { IsEnum, IsString, IsOptional, IsDateString } from 'class-validator';
import { ProjectType, Campus } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsEnum(ProjectType)
  type: ProjectType;

  @IsEnum(Campus)
  campus: Campus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}