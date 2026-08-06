import { IsString, IsEnum, IsOptional } from 'class-validator';
import { Campus } from '@prisma/client';

export class CreateOfficeDto {
  @IsString()
  name: string;

  @IsEnum(Campus)
  campus: Campus;

  @IsOptional()
  @IsString()
  description?: string;
}