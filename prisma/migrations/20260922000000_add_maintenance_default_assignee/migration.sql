-- Optional preference only; existing schedules continue with no preferred worker.
ALTER TABLE "MaintenanceSchedule"
ADD COLUMN "defaultAssigneeId" TEXT;

CREATE INDEX "MaintenanceSchedule_defaultAssigneeId_idx"
ON "MaintenanceSchedule"("defaultAssigneeId");

ALTER TABLE "MaintenanceSchedule"
ADD CONSTRAINT "MaintenanceSchedule_defaultAssigneeId_fkey"
FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
