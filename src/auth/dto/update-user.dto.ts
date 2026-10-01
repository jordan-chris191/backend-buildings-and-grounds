import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() officeId?: string | null;
  @IsOptional() @IsString() positionId?: string | null;
}
