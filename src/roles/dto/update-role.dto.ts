import { CreateRoleDto } from './create-role.dto';
import { IsOptional, IsString } from 'class-validator';

/** Role.code is deliberately absent: authorization identities cannot change. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: CreateRoleDto['name'];

  @IsOptional()
  @IsString()
  description?: CreateRoleDto['description'];
}
