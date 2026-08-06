// src/auth/dto/change-office.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class ChangeOfficeDto {
  // Optional so an admin can also clear a user's office (set to null)
  // by omitting it or passing an empty value, same convention as
  // other SetNull relations in this schema.
  @IsOptional()
  @IsString()
  officeId?: string;
}