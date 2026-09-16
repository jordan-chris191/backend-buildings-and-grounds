import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
