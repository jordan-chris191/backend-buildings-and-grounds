import { IsString, IsOptional } from 'class-validator';

export class CreatePositionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}