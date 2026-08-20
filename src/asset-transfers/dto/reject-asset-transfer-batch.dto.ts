import { IsOptional, IsString } from 'class-validator';

export class RejectAssetTransferBatchDto {
  @IsOptional()
  @IsString()
  notes?: string;
}