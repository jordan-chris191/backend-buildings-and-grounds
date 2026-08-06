import { IsString, IsEnum, IsOptional } from 'class-validator';
import { PersonType } from '@prisma/client';

export class CreatePersonDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsEnum(PersonType)
  type: PersonType;
}