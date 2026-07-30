// src/auth/dto/change-role.dto.ts
import { IsString } from 'class-validator';

export class ChangeRoleDto {
  @IsString()
  roleId: string;
}