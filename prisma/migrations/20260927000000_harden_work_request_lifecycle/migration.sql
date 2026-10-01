-- Additive operational lifecycle metadata. Existing rows remain valid: all
-- newly introduced WorkRequest fields are nullable or have a safe default.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
CREATE TYPE "ClarificationStatus" AS ENUM ('NONE', 'REQUESTED', 'RESPONDED');
CREATE TYPE "CompletionOutcome" AS ENUM ('RESOLVED', 'PARTIALLY_RESOLVED', 'REQUIRES_REPLACEMENT', 'REQUIRES_EXTERNAL_SERVICE', 'UNABLE_TO_REPAIR');
CREATE TYPE "OnBehalfReason" AS ENUM ('NO_NETWORK_ACCESS', 'NO_APP_ACCESS', 'DEVICE_UNAVAILABLE', 'WORKER_UNAVAILABLE', 'OTHER');
CREATE TYPE "ReassignmentReason" AS ENUM ('WORKER_UNAVAILABLE', 'WORKER_ON_LEAVE', 'WRONG_ASSIGNMENT', 'DIFFERENT_SKILL_REQUIRED', 'WORKLOAD_REBALANCE', 'OTHER');
CREATE TYPE "HoldReason" AS ENUM ('WAITING_FOR_MATERIALS', 'WAITING_FOR_PARTS', 'WAITING_FOR_ACCESS', 'WORKER_UNAVAILABLE', 'WEATHER', 'WAITING_FOR_EXTERNAL_SERVICE', 'OTHER');
CREATE TYPE "CommunicationMethod" AS ENUM ('IN_PERSON', 'PHONE', 'RADIO', 'OTHER');
CREATE TYPE "WorkRequestActivityType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_RESPONDED', 'ASSIGNED', 'REASSIGNED', 'WORKER_ACKNOWLEDGED', 'WORKER_INFORMED_MANUALLY', 'PROGRESS_UPDATED', 'PROGRESS_RECORDED_ON_BEHALF', 'PLACED_ON_HOLD', 'RESUMED', 'COMPLETED', 'COMPLETED_ON_BEHALF', 'REOPENED', 'CANCELLED');

ALTER TABLE "WorkRequest"
  ADD COLUMN "clarificationStatus" "ClarificationStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "completionOutcome" "CompletionOutcome",
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completionRecordedById" TEXT,
  ADD COLUMN "completionPerformedById" TEXT;
ALTER TABLE "WorkRequestAssignment"
  ADD COLUMN "unassignedById" TEXT,
  ADD COLUMN "reassignmentReason" "ReassignmentReason",
  ADD COLUMN "reassignmentReasonNotes" TEXT,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "manuallyInformedAt" TIMESTAMP(3),
  ADD COLUMN "manuallyInformedById" TEXT,
  ADD COLUMN "communicationMethod" "CommunicationMethod";

CREATE TABLE "WorkRequestActivity" (
  "id" TEXT NOT NULL, "workRequestId" TEXT NOT NULL, "type" "WorkRequestActivityType" NOT NULL,
  "actorId" TEXT, "performedById" TEXT, "metadata" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkRequestActivity_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_completionRecordedById_fkey" FOREIGN KEY ("completionRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_completionPerformedById_fkey" FOREIGN KEY ("completionPerformedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkRequestAssignment" ADD CONSTRAINT "WorkRequestAssignment_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkRequestAssignment" ADD CONSTRAINT "WorkRequestAssignment_manuallyInformedById_fkey" FOREIGN KEY ("manuallyInformedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkRequestActivity" ADD CONSTRAINT "WorkRequestActivity_workRequestId_fkey" FOREIGN KEY ("workRequestId") REFERENCES "WorkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkRequestActivity" ADD CONSTRAINT "WorkRequestActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkRequestActivity" ADD CONSTRAINT "WorkRequestActivity_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "WorkRequest_clarificationStatus_idx" ON "WorkRequest"("clarificationStatus");
CREATE INDEX "WorkRequest_completionRecordedById_idx" ON "WorkRequest"("completionRecordedById");
CREATE INDEX "WorkRequest_completionPerformedById_idx" ON "WorkRequest"("completionPerformedById");
CREATE INDEX "WorkRequestActivity_workRequestId_occurredAt_idx" ON "WorkRequestActivity"("workRequestId", "occurredAt");
CREATE INDEX "WorkRequestActivity_actorId_idx" ON "WorkRequestActivity"("actorId");
CREATE INDEX "WorkRequestActivity_performedById_idx" ON "WorkRequestActivity"("performedById");
