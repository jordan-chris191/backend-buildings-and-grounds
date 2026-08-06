import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWorkRequestDto } from './create-work-request.dto';

export class UpdateWorkRequestDto extends PartialType(
  OmitType(CreateWorkRequestDto, ['items', 'requestType', 'campus'] as const),
) {
  // Additional fields for updating status/progress might go here
  // but we handle them in dedicated endpoints
}