// src/auth/dto/create-user.dto.ts
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  roleId: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  /** Optional provisioning override.  The established default remains staff@123. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
