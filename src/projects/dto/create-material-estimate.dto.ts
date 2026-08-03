// src/projects/dto/create-material-estimate.dto.ts
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateMaterialEstimateDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  itemNo?: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  unitCost: number;
}