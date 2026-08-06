import { IsEnum } from 'class-validator';
import { ItemStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ItemStatus)
  status: ItemStatus;
}