import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CommunicationMethod, CompletionOutcome, HoldReason, OnBehalfReason, ReassignmentReason } from '@prisma/client';

export class ProgressOnBehalfDto {
  @IsString() performedByUserId: string;
  @IsInt() @Min(0) @Max(100) progressPercent: number;
  @IsOptional() @IsString() note?: string;
  @IsDateString() actualOccurredAt: string;
  @IsEnum(OnBehalfReason) reason: OnBehalfReason;
  @ValidateIf(x => x.reason === OnBehalfReason.OTHER) @IsString() @IsNotEmpty() reasonNotes?: string;
}

export class CompleteOnBehalfDto {
  @IsString() performedByUserId: string;
  @IsDateString() actualCompletedAt: string;
  @IsOptional() @IsDateString() dateTimeStarted?: string;
  @IsOptional() @IsObject() completionDetails?: Record<string, unknown>;
  @IsOptional() @IsString() comments?: string;
  @IsEnum(OnBehalfReason) reason: OnBehalfReason;
  @ValidateIf(x => x.reason === OnBehalfReason.OTHER) @IsString() @IsNotEmpty() reasonNotes?: string;
  @IsOptional() @IsEnum(CompletionOutcome) outcome?: CompletionOutcome;
}

export class ReassignWorkRequestDto {
  @IsString() assignmentId: string;
  @IsString() userId: string;
  @IsEnum(ReassignmentReason) reason: ReassignmentReason;
  @ValidateIf(x => x.reason === ReassignmentReason.OTHER) @IsString() @IsNotEmpty() reasonNotes?: string;
}

export class ManualInformDto { @IsEnum(CommunicationMethod) communicationMethod: CommunicationMethod; }
export class HoldWorkRequestDto {
  @IsEnum(HoldReason) reason: HoldReason;
  @IsOptional() @IsString() @ValidateIf(x => x.reason !== HoldReason.OTHER || !!x.notes) @IsNotEmpty() notes?: string;
}
export class ClarificationDto { @IsString() @IsNotEmpty() message: string; }
export class ReopenWorkRequestDto { @IsString() @IsNotEmpty() reason: string; }
