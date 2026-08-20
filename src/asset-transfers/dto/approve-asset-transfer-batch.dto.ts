import { IsOptional, IsString } from 'class-validator';

export class ApproveAssetTransferBatchDto {
  @IsOptional()
  @IsString()
  notes?: string;
}